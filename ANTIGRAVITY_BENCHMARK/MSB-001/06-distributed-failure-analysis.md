# 06 - Distributed Failure & Resilience Analysis

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Summary

In a microservice ecosystem relying on multiple datastores, message brokers, caching tiers, and inter-service HTTP clients, failure handling determines system survivability. An analysis of fault isolation and degradation paths across MaSoVa reveals that component failures trigger silent state loss, unhandled HTTP 500 errors, or permanently divergent data rather than graceful degradation.

---

## 2. Infrastructure Failure Scenario Matrix

### 2.1 Scenario 1: RabbitMQ Outage or Network Partition
* **Affected Component:** `SVamseekar/masova-platform` (`commerce-service`, `intel-service`)
* **Code Citation:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L473-478`
  ```java
  try {
      orderEventPublisher.publishOrderStatusChanged(
              buildStatusChangedEvent(updatedOrder, currentStatus.toString(), newStatus.toString()));
  } catch (Exception e) {
      log.warn("Failed to publish status changed event for {}: {}", updatedOrder.getOrderNumber(), e.getMessage());
  }
  ```
* **Execution Path & Failure Mechanics:**
  1. Kitchen staff updates order status from `PREPARING` to `BAKED`.
  2. Order document is updated in MongoDB and Postgres.
  3. `orderEventPublisher` attempts to publish to RabbitMQ broker via `rabbitTemplate.convertAndSend()`.
  4. Connection times out or throws `AmqpException`.
  5. The exception is caught by `catch (Exception e)` and logged with `log.warn()`.
* **Invariant Violated:** At-Least-Once Delivery & Eventual Consistency.
* **Production Consequence:**
  * No transactional outbox table exists in PostgreSQL or MongoDB.
  * The event is dropped permanently with zero retry queue or dead-letter queuing.
  * Downstream subscribers (`intel-service` analytics ingestion and demand forecasting) permanently miss the status transition, resulting in stale kitchen speed metrics.

---

### 2.2 Scenario 2: Redis Cache Unavailable
* **Affected Component:** `SVamseekar/masova-platform` (`commerce-service`, `api-gateway`)
* **Code Citation:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L444-446`
  ```java
  @Transactional
  @CacheEvict(value = {"salesMetrics", "staffLeaderboard", "staffPerformance",
                       "driverStatus", "salesTrends", "orderTypeBreakdown",
                       "peakHours", "topProducts"}, allEntries = true)
  public Order updateOrderStatus(String orderId, UpdateOrderStatusRequest request) { ... }
  ```
* **Execution Path & Failure Mechanics:**
  1. Redis container crashes or memory exhaustion (OOM) triggers connection refused.
  2. Order status update triggers Spring Cache `@CacheEvict`.
  3. By default, unless `CachingConfigurerSupport.errorHandler()` is explicitly overridden with a custom `CacheErrorHandler`, Spring Cache throws `RedisConnectionFailureException`.
* **Invariant Violated:** Fault Isolation (Cache outage must not block transactional business writes).
* **Production Consequence:**
  * A Redis caching layer failure crashes core kitchen operations: line staff cannot update order status, returning HTTP 500 across all status change endpoints.

---

### 2.3 Scenario 3: Asymmetric Database Failure (PostgreSQL Down, MongoDB Up)
* **Affected Component:** `SVamseekar/masova-platform` (`core-service`, `commerce-service`)
* **Code Citation:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L271-305`
  ```java
  Order savedOrder = orderRepository.save(order); // Mongo write
  syncToPostgres(savedOrder);                     // Postgres dual-write in try/catch
  ```
* **Execution Path & Failure Mechanics:**
  1. PostgreSQL container undergoes disk full, connection pool starvation, or crash.
  2. MongoDB is healthy. Customer creates an order.
  3. MongoDB writes document successfully.
  4. `syncToPostgres` throws `DataAccessResourceFailureException`.
  5. The exception is caught and logged at `WARN` level.
* **Invariant Violated:** Bi-directional Dual-Write Consistency.
* **Production Consequence:**
  * Customer receives HTTP 201 Created.
  * PostgreSQL receives nothing.
  * Any reporting tools, SQL BI pipelines, or financial reconciliation queries running against PostgreSQL will silently miss the transaction forever. No reconciliation worker or CDC (Change Data Capture) job exists to heal the drift.

---

### 2.4 Scenario 4: Inter-Service HTTP Call Silent Swallowing
* **Affected Component:** `SVamseekar/masova-platform` (`payment-service` -> `commerce-service`)
* **Code Citation:** `payment-service/src/main/java/com/masova/payment/client/OrderServiceClient.java:L114-120`
  ```java
  @Component
  class OrderServiceClientFallback implements OrderServiceClient {
      @Override
      public void updateOrderPaymentStatus(String orderId, UpdatePaymentRequest request) {
          log.warn("Fallback triggered: Failed to update payment status for order: {}", orderId);
      }
  }
  ```
* **Execution Path & Failure Mechanics:**
  1. Payment is captured via Stripe/Razorpay. Webhook is processed.
  2. `payment-service` triggers OpenFeign call `updateOrderPaymentStatus` to `commerce-service:8084`.
  3. `commerce-service` is saturated or undergoing deployment rolling restart.
  4. Hystrix/Resilience4j fallback executes: logs a warning and returns `void`.
* **Invariant Violated:** Transactional Coherence.
* **Production Consequence:**
  * Stripe/Razorpay webhook receives `200 OK` (acknowledging receipt).
  * `PaymentTransaction` is marked `SUCCESS` in payment database.
  * `Order` in commerce database remains in `PENDING` payment status indefinitely.
  * Order is never released to kitchen KDS, customer credit card is charged, but food is never cooked.

