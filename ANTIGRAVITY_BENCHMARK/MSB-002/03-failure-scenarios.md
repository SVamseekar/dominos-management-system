# 03 — Test 3: The Restaurant's Worst Day (Failure Scenarios)

**Benchmark:** MSB-002
**Title:** European Single-Restaurant Operational Readiness
**Perspective:** Chaos & Distributed Failure Simulation from Source Code
**Auditor:** Independent Reliability & Resilience Engineer
**Standard of Evidence:** Strict source-code citations (`Repository`, `File`, `Symbol`, `Line`)
**Status Tags:** `[VERIFIED FROM SOURCE]`, `[STRONGLY INFERRED]`, `[REQUIRES RUNTIME VALIDATION]`, `[REQUIRES LEGAL/TAX REVIEW]`

---

## 1. Scenario Simulation Matrix

| Scenario                       | Mode of Failure            | State Consistency          | Data Loss           | Financial Exposure              | Manual Reconciliation Required?       |
| :----------------------------- | :------------------------- | :------------------------- | :------------------ | :------------------------------ | :------------------------------------ |
| **A. PostgreSQL Down**         | Fails Silently             | Divergent (Mongo only)     | Yes (Relational)    | Low                             | **YES** (Full DB resync)              |
| **B. MongoDB Down**            | Fails Visibly (500)        | Blocked (Zero writes)      | No                  | Moderate (Lost sales)           | No (Transactions abort)               |
| **C. RabbitMQ Down**           | Fails Silently             | Divergent (Events lost)    | Yes (Event stream)  | Low                             | **YES** (Inventory/BI resync)         |
| **D. Redis Down**              | Fails Visibly (500)        | Blocked / Fails Open       | No                  | Low                             | **YES** (Restart / cache warmup)      |
| **E. Payment Webhook Drop**    | Fails Silently             | Divergent (Paid vs Unpaid) | Yes (Status update) | **CRITICAL** (Chargeback)       | **YES** (Identify unfulfilled orders) |
| **F. Customer Pays Twice**     | Fails Silently             | Inconsistent (2 payments)  | No                  | **HIGH** (Customer charged 2x)  | **YES** (Manual Stripe refund)        |
| **G. Concurrent Refunds**      | Fails Silently             | Corrupted (Over-refund)    | No                  | **HIGH** (Double gateway drain) | **YES** (Clawback/Loss dispute)       |
| **H. Driver Offline**          | Fails Visibly (App freeze) | Blocked in Transit         | No                  | Moderate (Delayed food)         | **YES** (Phone dispatch/override)     |
| **I. Concurrent Kitchen Bump** | Fails Visibly (500)        | Safe (Optimistic lock)     | No                  | None                            | No (Refresh & retry)                  |
| **J. Cancel During Prep**      | Fails Safely (Gate)        | Consistent (Pending req)   | No                  | Low (Wasted food if slow)       | **YES** (Manager review decision)     |

---

## 2. Detailed Technical Breakdown of Each Scenario

### Scenario A: PostgreSQL Unavailable
* **Component Behavior:**
  * `core-service/src/main/java/com/MaSoVa/core/user/service/UserService.java:L137`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L303-305`
  * `payment-service` & `logistics-service` (Do not use PostgreSQL at runtime)
* **What Happens:**
  1. In `OrderService.java:L271-305`, the order is first saved to MongoDB via `orderRepository.save(order)`.
  2. The service then enters the `try/catch` block for PostgreSQL synchronization:
     ```java
     try {
         OrderJpaEntity jpaEntity = ...;
         orderJpaRepository.save(jpaEntity);
     } catch (Exception e) {
         log.warn("PostgreSQL dual-write failed for order {}: {}", savedOrder.getOrderNumber(), e.getMessage());
     }
     ```
  3. When PostgreSQL is down, the connection timeout or SQL exception is caught, logged at `WARN` level, and execution continues.
  4. In `payment-service` and `logistics-service`, operations proceed unaffected because neither service contains JPA entities.
* **Failure Classification:**
  * **Fails Silently:** API callers receive HTTP 201 Created and have no visibility into database write failure.
  * **State Inconsistency:** MongoDB accumulates orders, users, and transactions; PostgreSQL remains frozen in time.
  * **Impact on Reporting & Reconciliation:** Any accounting or BI system connected to PostgreSQL will report €0 in sales, missing customer records, and incomplete audit trails. Full database resynchronization via batch script is required.

---

### Scenario B: MongoDB Unavailable
* **Component Behavior:**
  * All Spring Data MongoDB repositories across all 6 services.
* **What Happens:**
  1. `core-service`: `userRepository.findByEmail()` throws `DataAccessResourceFailureException`. Authentication and store lookup fail immediately.
  2. `commerce-service`: `orderRepository.save()` (`OrderService.java:L271`) is the primary write. Because it is not wrapped in an exception handler, it immediately throws `MongoException`, rolling back the Spring transaction.
  3. `payment-service`: Cannot persist transaction records (`TransactionRepository.save()`). Payment initiation crashes.
  4. `logistics-service`: Cannot persist driver location or dispatch tracking.
* **Failure Classification:**
  * **Fails Visibly:** Clients receive immediate **HTTP 500 Internal Server Error**.
  * **No Data Corruption:** Because MongoDB is the primary write barrier, no half-persisted records are accepted.
  * **Business Consequence:** Complete operational paralysis. POS terminals, mobile ordering, kitchen display, and dispatch halt entirely.

---

### Scenario C: RabbitMQ Unavailable
* **Component Behavior:**
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L308-312, L473-478`
  * `payment-service/src/main/java/com/MaSoVa/payment/service/PaymentService.java:L369-373`
* **What Happens:**
  1. In `OrderService.java:L308-312`:
     ```java
     try {
         orderEventPublisher.publishOrderCreated(OrderEventBuilder.buildOrderCreatedEvent(savedOrder));
     } catch (Exception e) {
         log.warn("Failed to publish order created event for {}: {}", savedOrder.getOrderNumber(), e.getMessage());
     }
     ```
     RabbitMQ publication failures are caught and logged at `WARN`.
  2. The HTTP request succeeds, and the order is saved in the database.
  3. Downstream listeners subscribed to `order.created` (e.g. inventory deduction in `logistics-service`, demand forecasting in `intelligence-service`, push notification listeners) never receive the event.
  4. **Absence of Transactional Outbox:** There is no outbox table or persistent backlog. The events are dropped permanently from memory.
* **Failure Classification:**
  * **Fails Silently:** Orders are placed, but decoupled asynchronous subsystems desynchronize.
  * **State Inconsistency:** Inventory levels in `logistics-service` are not decremented; ingredient stocks show false surplus; BI dashboards show inaccurate order counts.
  * **Manual Reconciliation:** Required. Operators must run manual reconciliation jobs to re-emit events or reconcile inventory counts against physical stock.

---

### Scenario D: Redis Unavailable
* **Component Behavior:**
  * `shared-security/src/main/java/com/MaSoVa/shared/security/filter/JwtAuthenticationFilter.java:L83-90`
  * Spring Cache annotations (`@Cacheable`, `@CacheEvict`) in `commerce-service` and `core-service`.
* **What Happens:**
  1. **Token Blacklist Fails Open:**
     ```java
     private boolean isBlacklisted(String token) {
         if (redisTemplate == null) return false;
         try {
             return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + token));
         } catch (Exception e) {
             return false; // fail-open: don't lock users out if Redis is down
         }
     }
     ```
     Revoked JWT tokens (e.g., from fired employees or logged-out users) are accepted as valid until their signature expires.
  2. **Cache Read Crashes:** Neither `commerce-service` nor `core-service` implements a custom `CacheErrorHandler`. By default, Spring Cache throws `RedisConnectionFailureException` when `@Cacheable` methods (e.g. `MenuService.getMenuItems`, `StoreService.getStore`) attempt to query Redis.
* **Failure Classification:**
  * **Security:** Fails open (revoked credentials accepted).
  * **API Operations:** Fails visibly with **HTTP 500** on cached menu and store endpoints.
  * **Manual Reconciliation:** Redis must be recovered; applications must be restarted to re-establish connection pools.

---

### Scenario E: Payment Confirmed by Gateway, But MaSoVa Cannot Update Order
* **Component Behavior:**
  * `payment-service/src/main/java/com/MaSoVa/payment/controller/StripeWebhookController.java:L51-53`
  * `payment-service/src/main/java/com/MaSoVa/payment/service/OrderServiceClient.java:L43-45, L114-120`
* **What Happens:**
  1. Stripe charges the customer's credit card and posts a `payment_intent.succeeded` webhook to `POST /api/payments/webhook/stripe`.
  2. `StripeWebhookController` verifies the signature and invokes `paymentService.handleStripeWebhookEvent()`.
  3. `payment-service` updates MongoDB `transactions` to status `SUCCESS`.
  4. It then calls `orderServiceClient.updateOrderPaymentStatus(orderId, "PAID", transactionId)`.
  5. If `commerce-service` is unreachable, timing out, or restarting, Resilience4j trips the circuit breaker and invokes `updateOrderPaymentStatusFallback`:
     ```java
     private void updateOrderPaymentStatusFallback(String orderId, String status, String transactionId, Exception ex) {
         log.warn("Circuit breaker fallback for updateOrderPaymentStatus. Order: {}, Status: {}, Transaction: {}, Error: {}",
                 orderId, status, transactionId, ex.getMessage());
         // Don't throw exception - payment succeeded even if order update failed
     }
     ```
  6. The method returns `void` without throwing an exception.
  7. `StripeWebhookController` returns **HTTP 200 OK ("Webhook processed")** to Stripe.
  8. Stripe marks the webhook as successfully acknowledged and stops retrying.
* **Failure Classification:**
  * **Fails Silently & Disastrously:**
  * Customer was charged real money.
  * `commerce-service` still marks order as `PENDING` (unpaid).
  * Kitchen never receives an order ticket (kitchen displays only show confirmed orders).
  * Customer waits for food that will never be cooked.
  * **Financial Exposure:** High chargeback risk, merchant dispute fees, and customer goodwill loss.
  * **Manual Reconciliation:** Required immediately. Staff must inspect the payment transactions table and manually update order status in commerce.

---

### Scenario F: Customer Pays Twice
* **Component Behavior:**
  * `payment-service/src/main/java/com/MaSoVa/payment/service/PaymentService.java:L80-137, L344-348`
* **What Happens:**
  1. **Duplicate Webhook Delivery (Same PaymentIntent):** Handled safely. In `PaymentService.java:L344-348`, if `transaction.getStatus() == SUCCESS`, it logs an info message and exits idempotently.
  2. **Duplicate Intent Creation (Customer Double-Tap):** `initiatePayment()` does not check if an active transaction already exists for `request.getOrderId()`.
  3. Each call creates a distinct Stripe `PaymentIntent` and a distinct MongoDB `Transaction` document.
  4. If the customer completes payment on both intents (e.g., across two browser tabs or retry sheets), Stripe processes both payments.
  5. Two distinct webhook events arrive with different `PaymentIntent` IDs. Both transactions are updated to `SUCCESS`, and both trigger payment completed events.
* **Failure Classification:**
  * **Fails Silently:** Both charges settle on the customer's card.
  * **Financial Exposure:** Customer is charged 2x for a single meal.
  * **Manual Reconciliation:** Required. Merchant must manually locate the duplicate transaction in Stripe Dashboard and issue a refund.

---

### Scenario G: Refund Requested Twice Concurrently
* **Component Behavior:**
  * `payment-service/src/main/java/com/MaSoVa/payment/service/RefundService.java:L153-183`
* **What Happens:**
  1. `validateRefundable()` queries existing refunds:
     ```java
     List<Refund> existingRefunds = refundRepository.findByTransactionId(request.getTransactionId());
     BigDecimal totalCommitted = ...;
     BigDecimal availableForRefund = transaction.getAmount().subtract(totalCommitted);
     if (request.getAmount().compareTo(availableForRefund) > 0) {
         throw new RuntimeException("Refund amount exceeds available amount.");
     }
     ```
  2. There is **no database lock, no MongoDB transaction, and no Redis distributed lock** guarding this check.
  3. If two concurrent requests arrive (e.g., two managers clicking "Approve" simultaneously, or an API race condition):
     * Request 1 reads `availableForRefund = €50.00`.
     * Request 2 reads `availableForRefund = €50.00`.
     * Both validate successfully.
     * Both invoke `performGatewayRefund()` against Stripe.
     * Stripe processes both refunds of €50.00 each.
* **Failure Classification:**
  * **Financial Exposure:** €100.00 refunded on a €50.00 original charge. The merchant's bank account is drained twice.
  * **State Inconsistency:** Two processed refund records appear on a single transaction.
  * **Manual Reconciliation:** Mandatory. Merchant must dispute the loss or attempt customer clawback.

---

### Scenario H: Driver Loses Network Connectivity
* **Component Behavior:**
  * `logistics-service/src/main/java/com/MaSoVa/logistics/delivery/service/ProofOfDeliveryService.java:L71-120`
  * `MaSoVaCrewApp/src/store/api/orderApi.ts`
* **What Happens:**
  1. Proof-of-delivery requires an active network call to `POST /api/delivery/verify-otp`.
  2. The mobile app has no offline SQLite/WatermelonDB sync engine, no cryptographically verifiable offline OTP token, and no store-and-forward queue.
  3. If the driver arrives at an apartment building with poor mobile reception, the driver cannot verify the customer's OTP or complete the delivery.
  4. The order remains locked in status `OUT_FOR_DELIVERY` or `DISPATCHED`.
* **Failure Classification:**
  * **Fails Visibly:** App displays network timeout error.
  * **Operational Consequence:** Driver must return to store or call the manager via cellular phone to request manual POS override.

---

### Scenario I: Kitchen Staff Advances Order State Twice Concurrently
* **Component Behavior:**
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/entity/Order.java:L32-33`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L513-548`
* **What Happens:**
  1. `Order.java` has `@Version private Long version;` mapped in MongoDB.
  2. Two staff members tap "Next Stage" on separate KDS screens for Order #100 (version 3).
  3. Request 1 reads version 3, updates status to `BAKED`, and saves with version 4.
  4. Request 2 attempts to save with version 3. Spring Data MongoDB detects the version mismatch and throws `OptimisticLockingFailureException`.
  5. Because `moveOrderToNextStage` does not catch this exception, Request 2 crashes with **HTTP 500**.
* **Failure Classification:**
  * **Fails Safely:** Order state is not corrupted. Status correctly advances to `BAKED`.
  * **Fails Visibly:** One staff member receives an error toast on their screen. A simple UI refresh resolves the issue.

---

### Scenario J: Customer Cancels While Restaurant Is Preparing the Order
* **Component Behavior:**
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L631-700`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L316-360`
* **What Happens:**
  1. Customer submits cancellation request via `POST /api/orders/{id}/cancel-request`.
  2. `OrderService.requestCancellation()` marks `order.cancellationRequested = true` and `cancellationRequestReason = ...`.
  3. **The order status does NOT change.** It remains `PREPARING`.
  4. A notification is sent to the manager dashboard.
  5. The kitchen continues preparing the order until a manager explicitly approves (`POST /api/orders/{id}/cancel-request/approve`) or rejects (`POST /api/orders/{id}/cancel-request/reject`) the cancellation.
  6. If the manager approves, `cancelOrder()` sets status to `CANCELLED` and notifies kitchen via WebSocket.
* **Failure Classification:**
  * **Fails Safely:** Excellent business-rule design. Prevents customers from unilaterally aborting orders already on the grill.
  * **Operational Exposure:** If the manager is away from the POS terminal, food may be cooked before the cancellation request is reviewed.

---

## 3. Resilience Verdict: Unsafe for Peak Operations

While Scenarios I and J demonstrate sound technical choices (optimistic locking and cancellation approval gates), the system's response to **Scenarios E, F, G, and C is catastrophically unsafe**:
* **Silent dropped payments (Scenario E)** and **unlocked double-refunds (Scenario G)** create direct financial losses.
* **The absence of an outbox pattern (Scenario C)** guarantees event stream corruption during message broker blips.
* **A single Saturday evening network hiccup will result in missing orders, double-charged diners, and chaotic manual reconciliation.**

