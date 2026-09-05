# 05 - Order State Machine & Invariant Analysis

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Formal Order State Machine Specification

The canonical domain model across `shared-models` (`com.MaSoVa.shared.enums.OrderStatus.java:L3-15`) and `commerce-service` (`com.MaSoVa.commerce.order.entity.Order.java:L422-434`) declares eleven formal states:

```
RECEIVED -> PREPARING -> OVEN -> BAKED -> READY -> DISPATCHED -> OUT_FOR_DELIVERY -> DELIVERED
                                         |           |
                                         |           +--> SERVED (DINE_IN)
                                         +--------------> COMPLETED (TAKEAWAY)
                                         +--------------> CANCELLED (Terminal)
```

---

## 2. Transition Validation Implementation Audit

In `commerce-service`, status transitions are validated in `OrderService.java` (`validateStatusTransition` at lines 908–925 and `getValidTransitions` at lines 927–941).

### 2.1 Code Implementation Citation
```java
// File: commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L908-925
private void validateStatusTransition(OrderStatus current, OrderStatus target) {
    if (current == OrderStatus.CANCELLED || current == OrderStatus.DELIVERED) {
        throw new RuntimeException("Cannot update status of completed order");
    }

    // Allow backward transitions for corrections
    if (target == OrderStatus.CANCELLED) {
        return;
    }

    // Validate forward transitions
    List<OrderStatus> validTransitions = getValidTransitions(current);
    if (!validTransitions.contains(target)) {
        throw new RuntimeException(
            String.format("Invalid status transition from %s to %s", current, target)
        );
    }
}
```

---

## 3. Critical Invariant Violations & Security Flaws

### 3.1 Flaw 1: Terminal State Cancellation Bypass for Dine-In & Takeaway
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`
* **Lines:** 909–916
* **Vulnerability Analysis:**
  * Line 909 checks:
    ```java
    if (current == OrderStatus.CANCELLED || current == OrderStatus.DELIVERED) {
        throw new RuntimeException("Cannot update status of completed order");
    }
    ```
  * Notice that terminal states `SERVED` (Dine-In final state) and `COMPLETED` (Takeaway final state) are **missing** from this check.
  * Immediately following, line 914 executes:
    ```java
    if (target == OrderStatus.CANCELLED) {
        return;
    }
    ```
  * **Exploitable Consequence:** An order that has already been eaten at the table (`SERVED`) or picked up and taken home (`COMPLETED`) can still be transitioned to `CANCELLED`. If triggered, staff or malicious actors can cancel already-consumed orders, wiping the order from active sales metrics, triggering unearned refunds, or skewing inventory reconciliation.

### 3.2 Flaw 2: Complete State Machine Bypass in `markOrderDelivered`
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`
* **Lines:** 1379–1388
* **Vulnerability Analysis:**
  * Unlike `updateOrderStatus()`, `markOrderDelivered(String orderId, LocalDateTime deliveredAt, String proofType)` directly overwrites the status without calling `validateStatusTransition()`:
    ```java
    order.setStatus(OrderStatus.DELIVERED);
    order.setDeliveredAt(deliveredAt);
    order.setCompletedAt(deliveredAt);
    order.setDeliveryProofType(proofType);
    orderRepository.save(order);
    ```
  * **Exploitable Consequence:** Any delivery webhook, logistics service call, or direct caller can force an order that is currently `CANCELLED`, `PENDING`, or `PREPARING` directly into `DELIVERED`.

### 3.3 Flaw 3: Optimistic Locking & Race Conditions
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/entity/Order.java`
* **Line:** 32–33
* **Implementation:**
  ```java
  @Version
  private Long version;
  ```
* **Analysis:**
  * Spring Data MongoDB supports `@Version` for document-level optimistic concurrency control.
  * However, in `updateOrderStatus` (`OrderService.java:L447-470`), if two concurrent requests arrive (e.g. Kitchen advancing order to `PREPARING` while Payment Webhook attempts to update payment status to `PAID` via `updatePaymentStatus`), one transaction will throw `OptimisticLockingFailureException`.
  * In `OrderController.java`, there is **no retry interceptor** (`@Retryable`) configured on `updateOrderStatus` or `updatePaymentStatus`. The concurrent caller receives an unhandled 500 error.

---

## 4. Cross-Repository State Inconsistency

| State Identifier       | `shared-models` | `commerce-service` | `masova-mobile`                                 | `MaSoVaCrewApp`                        | Production Invariant Violated                                                                                                 |
| :--------------------- | :-------------- | :----------------- | :---------------------------------------------- | :------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **`RECEIVED`**         | Present (L4)    | Present (L423)     | Present (L37)                                   | Present                                | Consistent                                                                                                                    |
| **`OVEN`**             | Present (L6)    | Present (L425)     | Present (L39)                                   | Missing                                | Driver UI has no comprehension of oven stage                                                                                  |
| **`READY`**            | Present (L8)    | Present (L427)     | Missing in Delivery (L40 calls `BAKED` "Ready") | Missing                                | Customer app skips `READY` stage                                                                                              |
| **`OUT_FOR_DELIVERY`** | Present (L10)   | Present (L429)     | **MISSING** (L36-43)                            | **MISSING** (ActiveDeliveryScreen:L38) | **CRITICAL:** Status exists on backend; frontend indices return `-1`, driver screen filters it out, customer progress UI dies |
| **`SERVED`**           | Present (L12)   | Present (L431)     | Present in Dine-in                              | Missing                                | Terminal state cancellation bug                                                                                               |
| **`COMPLETED`**        | Present (L13)   | Present (L432)     | Present in Takeaway                             | Missing                                | Terminal state cancellation bug                                                                                               |

