# 04 - End-to-End Order Lifecycle Trace

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Overview of the Lifecycle Trace

This document executes an end-to-end, code-level execution trace of a customer order across all five repositories and infrastructure components, following the control flow from checkout inception to physical delivery completion.

---

## 2. Stage-by-Stage Code Trace

### Stage 1: Checkout & Inception (Mobile Customer App)
* **Component:** `SVamseekar/masova-mobile`
* **File:** `src/screens/CheckoutScreen.tsx`
* **Symbol:** `handlePlaceOrder`
* **Lines:** 142–168
* **Trace:**
  1. Customer selects cart items, delivery address, and payment method (`ONLINE`).
  2. Dispatches RTK Query mutation `createOrder` defined in `src/services/orderApi.ts:L44-52`.
  3. Sends HTTP `POST /orders` with JSON payload containing `storeId`, `items`, `deliveryAddress`, `paymentMethod`.
  4. Outbound HTTP request hits `http://api-gateway:8080/api/orders`.

---

### Stage 2: Gateway Ingress & Token Authentication
* **Component:** `SVamseekar/masova-platform` (`api-gateway`)
* **File:** `api-gateway/src/main/java/com/masova/gateway/filter/JwtAuthenticationFilter.java`
* **Symbol:** `filter`
* **Lines:** 58–112
* **Trace:**
  1. Gateway extracts `Authorization: Bearer <JWT>` header.
  2. `JwtTokenProvider.validateToken()` validates signature against HMAC secret.
  3. Claims are parsed: `userId`, `role=CUSTOMER`, `tenantId=store-01`.
  4. Downstream headers injected:
     * `X-User-Id: cust-991`
     * `X-User-Role: ROLE_CUSTOMER`
     * `X-Tenant-Id: store-01`
  5. Route rule `api-gateway/src/main/resources/application.yml` forwards request to `http://commerce-service:8084/api/orders`.

---

### Stage 3: Order Persistence & Inverted Dual-Write
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
* **Symbol:** `createOrder` (Lines 82–95)
* **File:** `commerce-service/src/main/java/com/masova/commerce/service/OrderService.java`
* **Symbol:** `createOrder` (Lines 215–305)
* **Trace:**
  1. `OrderController` receives DTO, validates store status, delegates to `OrderService.createOrder()`.
  2. Tax and total calculations performed. Order status initialized to `PENDING`.
  3. **MongoDB Write (Primary):**
     * Citation: `OrderService.java:L271`
     * `Order savedOrder = orderRepository.save(order);`
     * MongoDB document written to `orders` collection synchronously.
  4. **PostgreSQL Write (Secondary, Swallowed):**
     * Citation: `OrderService.java:L280-302`
     ```java
     try {
         OrderJpaEntity jpaEntity = orderMapper.toJpaEntity(savedOrder);
         orderJpaRepository.save(jpaEntity);
     } catch (Exception e) {
         log.warn("Failed to dual-write order to PostgreSQL: {}", e.getMessage());
         // Exception is swallowed; request proceeds!
     }
     ```
  5. **Event Emission:**
     * Citation: `OrderService.java:L285`
     * `rabbitTemplate.convertAndSend(EXCHANGE_ORDERS, ROUTING_KEY_ORDER_CREATED, orderCreatedEvent);`
  6. Returns `OrderDto` (HTTP 201 Created) to mobile app.

---

### Stage 4: Payment Processing & Circuit Breaker Swallow
* **Component:** `SVamseekar/masova-platform` (`payment-service`)
* **File:** `payment-service/src/main/java/com/masova/payment/controller/PaymentWebhookController.java`
* **Symbol:** `handleStripeWebhook` (Lines 85–110)
* **File:** `payment-service/src/main/java/com/masova/payment/client/OrderServiceClient.java`
* **Symbol:** `updateOrderPaymentStatus` & `updateOrderPaymentStatusFallback` (Lines 98–120)
* **Trace:**
  1. Stripe webhook posts `payment_intent.succeeded` to `/api/webhooks/stripe`.
  2. Payment service updates `PaymentTransaction` status to `SUCCESS` in MongoDB.
  3. Payment service calls `commerce-service` via OpenFeign:
     `orderServiceClient.updateOrderPaymentStatus(orderId, updatePaymentRequest);`
  4. **The Silent Failure Window:**
     * Citation: `OrderServiceClient.java:L114-120`
     ```java
     @Component
     class OrderServiceClientFallback implements OrderServiceClient {
         @Override
         public void updateOrderPaymentStatus(String orderId, UpdatePaymentRequest request) {
             log.warn("Fallback triggered: Failed to update payment status for order: {}", orderId);
             // Swallows error, returns void, does not retry or enqueue dead-letter!
         }
     }
     ```
  5. If `commerce-service` is restarting or network hiccups, Stripe webhook receives `200 OK`, transaction is marked `SUCCESS` in payment service, but `commerce-service` remains permanently at `PENDING`.

---

### Stage 5: Kitchen Fulfillment & Status Progression
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
* **Symbol:** `updateOrderStatus`
* **Lines:** 204–215
* **Trace:**
  1. Kitchen staff updates status via Web Portal (`POST /api/orders/{orderId}/status`).
  2. Order advances: `CONFIRMED` -> `PREPARING` -> `BAKED` -> `READY`.
  3. Each transition calls `OrderService.updateOrderStatus()` (`L450-510`):
     * Updates MongoDB and Postgres.
     * Publishes `order.status.changed` to RabbitMQ.
     * Broadcasts status over WebSocket to customer app.

---

### Stage 6: Dispatch & Logistics Proof of Delivery
* **Component:** `SVamseekar/masova-platform` (`logistics-service`)
* **File:** `logistics-service/src/main/java/com/masova/logistics/service/DispatchService.java`
* **Symbol:** `assignDriver`
* **Lines:** 112–145
* **Trace:**
  1. Dispatch service assigns driver `drv-404`, transitions delivery status to `DISPATCHED`.
  2. Generates 4-digit OTP (`1842`) stored in `Delivery` document (`logistics-service/src/main/java/com/masova/logistics/service/ProofOfDeliveryService.java:L82`).
  3. Publishes `delivery.dispatched` to RabbitMQ.

---

### Stage 7: Physical Delivery & The "Silent Delivery Black Hole"
* **Component:** `SVamseekar/masova-platform` (`logistics-service` & `commerce-service`)
* **File:** `logistics-service/src/main/java/com/masova/logistics/service/ProofOfDeliveryService.java`
* **Symbol:** `verifyOtpAndCompleteDelivery` (Lines 210–235)
* **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
* **Symbol:** `markOrderDelivered` (Lines 253–258)
* **File:** `commerce-service/src/main/java/com/masova/commerce/service/OrderService.java`
* **Symbol:** `markOrderDelivered` (Lines 1379–1399)
* **Trace:**
  1. Driver inputs customer OTP; `ProofOfDeliveryService.verifyOtpAndCompleteDelivery()` matches OTP successfully.
  2. `ProofOfDeliveryService` invokes `commerce-service` OpenFeign client:
     * Citation: `ProofOfDeliveryService.java:L221`
     * `orderServiceClient.markOrderDelivered(delivery.getOrderId());`
  3. In `OrderController.java:L253`:
     ```java
     @PostMapping("/{orderId}/delivered")
     public ResponseEntity<Void> markOrderDelivered(@PathVariable String orderId) {
         orderService.markOrderDelivered(orderId);
         return ResponseEntity.ok().build();
     }
     ```
  4. In `OrderService.java:L1379-1399`:
     ```java
     @Transactional
     public void markOrderDelivered(String orderId) {
         Order order = orderRepository.findById(orderId)
                 .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
         order.setStatus(Order.OrderStatus.DELIVERED);
         orderRepository.save(order);
         try {
             orderJpaRepository.updateStatus(orderId, OrderStatus.DELIVERED);
         } catch (Exception e) {
             log.warn("Postgres update failed: {}", e.getMessage());
         }
         // METHOD TERMINATES HERE!
     }
     ```
* **Catastrophic Failure Analysis (The Black Hole):**
  Compare `markOrderDelivered` with standard `updateOrderStatus` (`OrderService.java:L450-510`):
  * `updateOrderStatus` executes:
    * `rabbitTemplate.convertAndSend(EXCHANGE_ORDERS, ROUTING_KEY_ORDER_STATUS, event);` (L474)
    * `customerServiceClient.updateOrderStats(order.getCustomerId(), order.getTotal());` (L481)
    * `fiscalSigningService.signOrder(order);` (L502)
    * `webSocketController.sendOrderUpdateToCustomer(order);`
  * `markOrderDelivered` executes **NONE** of these:
    1. **Zero RabbitMQ Events:** `order.status.changed` is never published. Downstream analytics (`intel-service`) never registers delivery completion.
    2. **Zero Loyalty Points:** Customer loyalty stats in `core-service` are never credited.
    3. **Zero Fiscal Compliance Signatures:** Mandatory tax/receipt cryptographic signing is bypassed, violating EU fiscal compliance laws.
    4. **Zero WebSocket Notifications:** The customer's mobile app never receives a delivery completion push, remaining frozen on the active delivery screen until manually refreshed.

