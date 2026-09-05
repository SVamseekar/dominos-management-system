# 14 - Event-Driven Architecture & Message Broker Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Broker Topology & Queue Configuration

The asynchronous message architecture is orchestrated via RabbitMQ 3.13 (`masova.events`), configured in `shared-models/src/main/java/com/MaSoVa/shared/messaging/config/MaSoVaRabbitMQConfig.java`.

### 1.1 Exchanges & Routing Key Matrix
* **`masova.orders.events` (Topic Exchange, Durable):**
  * `order.created`: Order placement publication (`OrderService.java:L285`).
  * `order.status.changed`: Order lifecycle state transition publication (`OrderService.java:L474`).
  * `order.receipt.signed`: EU fiscal receipt compliance signing (`OrderService.java:L503`).
* **`masova.payments.events` (Topic Exchange, Durable):**
  * `payment.completed`: Successful capture event.
  * `payment.failed`: Gateway payment decline.
* **`masova.delivery.events` (Topic Exchange, Durable):**
  * `delivery.assigned`: Driver assignment dispatch.
  * `delivery.completed`: Physical handover.
* **`masova.dlx` (Dead Letter Exchange):**
  * Routes unprocessable messages to `masova.dlq`.

---

## 2. Broker Audit & Critical Failure Modes

### 2.1 Critical Defect: The Silent Proof-of-Delivery Event Black Hole
* **Code Trace:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`
* **Method:** `markOrderDelivered(String orderId, LocalDateTime deliveredAt, String proofType)`
* **Lines:** 1379–1399
* **Analysis:**
  * When delivery OTP is verified via `ProofOfDeliveryService.java:L221`, `commerce-service` updates the order status to `DELIVERED`.
  * In the standard status transition method (`updateOrderStatus` at line 474), the service publishes to RabbitMQ:
    ```java
    orderEventPublisher.publishOrderStatusChanged(
            buildStatusChangedEvent(updatedOrder, currentStatus.toString(), newStatus.toString()));
    ```
  * In `markOrderDelivered()` (`L1379-1399`), **this event publication call is completely missing**.
* **Ecosystem Blast Radius:**
  * `masova.notification.order-events` (bound to `order.#` at line 86) receives zero messages. No push notification or SMS is dispatched to the customer.
  * `masova.analytics.order-events` (bound to `order.#` at line 112) receives zero messages. Analytics in `intel-service` records the order as perpetually in-transit or stuck in `DISPATCHED`, corrupting operational KPI reports and driver payout calculations.
  * `masova.compliance.order-events` (bound to `order.receipt.#` at line 138) receives zero messages. Fiscal receipt records are never submitted to the tax ledger.

---

### 2.2 Lack of Transactional Outbox & Message Loss Window
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L473-478`
* **Implementation:**
  ```java
  try {
      orderEventPublisher.publishOrderStatusChanged(...);
  } catch (Exception e) {
      log.warn("Failed to publish status changed event for {}: {}", updatedOrder.getOrderNumber(), e.getMessage());
  }
  ```
* **Failure Analysis:**
  * Order status is committed to MongoDB and PostgreSQL.
  * If the RabbitMQ connection experiences a blip or socket timeout, the publish call throws an exception.
  * The exception is caught and logged at `WARN` level.
  * **Consequence:** Because there is no transactional outbox table or persistent message queue in the relational store, the event is permanently lost. Downstream consumers have no mechanism to detect or replay dropped messages.

---

### 2.3 Consumer Idempotency Deficits
* **Component:** `SVamseekar/masova-platform` (`intel-service`)
* **Analysis:**
  * Message consumers in `intel-service` receive events across `masova.analytics.order-events`.
  * RabbitMQ provides **at-least-once** delivery guarantees; redelivered messages have `amqp_redelivered=true`.
  * `intel-service` does not verify message uniqueness against a dedicated processed-events ledger. Redelivered order status events trigger duplicate metric increments, inflating store revenue and kitchen throughput calculations.

