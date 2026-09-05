# MSB-003 — European Multi-Store Chain Readiness Audit
## Document 08: Centralized Payment System, Concurrency & Settlement Audit

**Target Enterprise:** European Restaurant Chain (100 Stores, €5M+ Monthly Payment Flow)  
**Evaluator:** Head of Financial Engineering, Payment Compliance Officer & CTO  
**Scope:** `PaymentService`, `RefundService`, `StripeWebhookController`, Gateway Integrations  
**Confidence Classification:** `[VERIFIED]` (Verified against payment flows, lock absence, and ledger state)  
**Verdict:** **CRITICAL FINANCIAL HAZARD (CONCURRENCY RACES & UNPROTECTED REFUNDS)**  

---

### 1. Enterprise Payment Flow Trace: Checkout to Settlement

Operating 100 high-volume restaurants across Europe requires robust transaction authorization, webhook idempotency, strict refund authorization, and multi-currency bank settlement.

```
[Customer POS / App]
       │
       │ (1) POST /api/payments/create-intent (Amount: €35.00, Currency: EUR, StoreId: DOM001)
       ▼
[payment-service]
       │
       │ (2) Calls Stripe API -> Creates PaymentIntent pi_xxx
       │ (3) Saves Transaction to MongoDB (Status: INITIATED)
       ▼
[Stripe Gateway] ──> (Customer Authorizes via 3DS / Apple Pay)
       │
       │ (4) Webhook: payment_intent.succeeded
       ▼
[StripeWebhookController.java] (L46-51)
       │ Verifies Stripe-Signature
       ▼
[PaymentService.java] (L343-373)
       │ (5) Updates Transaction in MongoDB -> SUCCESS
       │ (6) Calls orderServiceClient.updateOrderPaymentStatus(...)
       │     ** FAILURE HAZARD: If commerce is busy, CircuitBreaker swallows error!
       │ (7) Publishes PaymentCompletedEvent via RabbitMQ
       ▼
[Settlement & Reporting]
       │ MongoDB only; PostgreSQL payment_schema is EMPTY!
```

---

### 2. Forensic Discovery 1: The Refund Concurrency Race Condition

In `payment-service/src/main/java/com/MaSoVa/payment/service/RefundService.java`:
```java
153:     private Transaction loadAndValidateRefundable(RefundRequest request) {
154:         Transaction transaction = transactionRepository.findById(Objects.requireNonNull(request.getTransactionId()))
155:                 .orElseThrow(() -> new RuntimeException("Transaction not found: " + request.getTransactionId()));
156:         validateRefundable(request, transaction, null);
157:         return transaction;
158:     }
159: 
160:     private void validateRefundable(RefundRequest request, Transaction transaction, String excludeRefundId) {
...
169:         List<Refund> existingRefunds = refundRepository.findByTransactionId(request.getTransactionId());
170:         BigDecimal totalCommitted = existingRefunds.stream()
171:                 .filter(r -> excludeRefundId == null || !excludeRefundId.equals(r.getId()))
172:                 .filter(r -> r.getStatus() == Refund.RefundStatus.PROCESSED
173:                         || r.getStatus() == Refund.RefundStatus.PENDING_APPROVAL
174:                         || r.getStatus() == Refund.RefundStatus.INITIATED
175:                         || r.getStatus() == Refund.RefundStatus.PROCESSING)
176:                 .map(Refund::getAmount)
177:                 .reduce(BigDecimal.ZERO, BigDecimal::add);
178: 
179:         BigDecimal availableForRefund = transaction.getAmount().subtract(totalCommitted);
180:         if (request.getAmount().compareTo(availableForRefund) > 0) {
181:             throw new RuntimeException("Refund amount exceeds available amount. Available: " + availableForRefund);
182:         }
183:     }
```

#### The Exploit / Race Condition Trace:
* **Precondition:** A customer order has a successful transaction of €100.00.
* **The Attack / Concurrency Window:** Two refund requests for €100.00 each arrive within the same 50ms window (e.g. customer double-submits a dispute, or two support agents process a refund concurrently):
  1. **Thread A** executes Line 169: `refundRepository.findByTransactionId()`. It finds 0 existing refunds. `totalCommitted = €0.00`, `availableForRefund = €100.00`. Validation passes.
  2. **Thread B** simultaneously executes Line 169 before Thread A has inserted a new refund. It also sees `totalCommitted = €0.00`, `availableForRefund = €100.00`. Validation passes!
  3. **Thread A** calls `executeRefund()` -> Calls Stripe API -> **Stripe executes €100 refund**.
  4. **Thread B** calls `executeRefund()` -> Calls Stripe API -> **Stripe executes a second €100 refund**.
* **Financial Blast Radius:** €200.00 is refunded to the customer on a €100.00 transaction, directly draining the restaurant chain's merchant account.
* **Root Cause:** Total absence of concurrency control:
  - No `@Version` optimistic locking on the `Transaction` MongoDB document.
  - No database pessimistic lock.
  - No distributed Redis lock (`Redisson` / `RLock`) keyed on `transactionId`.

---

### 3. Forensic Discovery 2: Lack of Store Authorization on Refunds

As demonstrated in Document 02 (Vector 6):
* `RefundRequest` specifies only `transactionId`, `amount`, and `reason`.
* `RefundService.processRefund()` never inspects the `storeId` on the `Transaction` entity against the caller's authenticated store.
* A store manager at Store `DOM001` (Munich) possessing legitimate credentials can submit a refund against a transaction generated at Store `DOM002` (Hamburg), manipulating financial P&L statements across independent franchise corporations.

---

### 4. Forensic Discovery 3: Multi-Currency Settlement & Fee Miscalculation

In `payment-service/src/main/java/com/MaSoVa/payment/service/PaymentService.java:L353-355`:
```java
353:         if (result.getStripeFeeAmountMinor() != null) {
354:             transaction.setStripeFeeMinorUnits(result.getStripeFeeAmountMinor());
355:         }
```
* The transaction record stores `stripeFeeMinorUnits` in cents/pence, but the primary transaction `amount` is stored as `BigDecimal` in major units (€).
* In multi-currency transactions (e.g. a British tourist paying with a GBP card in a Paris store):
  - Stripe settles in EUR with the merchant, but charges currency conversion fees.
  - `PaymentService` has no ledger fields for interchange fees, FX spread, scheme fees, or settlement netting.
  - The daily reconciliation report (`PaymentController:L146`) calculates gross transaction amounts without deducting processor fees or accounting for conversion loss.

---

### 5. Forensic Discovery 4: Non-Existent Relational Auditability (PCI-DSS & SOX)

Under PCI-DSS Requirement 10 and European financial accounting standards:
* All financial transactions must be recorded in an append-only, tamper-evident relational audit log with immutable timestamps.
* As proven in Document 07, `payment-service` writes **100% to MongoDB**.
* MongoDB documents can be updated in-place via simple `db.transactions.updateOne(...)` queries. Any developer, database administrator, or compromised service with MongoDB credentials can alter transaction amounts, refund statuses, or fee records without leaving an audit trail in PostgreSQL.

---

### 6. CTO Verdict on Payment Enterprise Readiness

The payment subsystem is **unfit for enterprise financial operations**:
1. Fatal concurrency vulnerability allows double-refunds and account draining.
2. Cross-store refund manipulation is completely unprotected.
3. Swallowed circuit breakers disconnect payment capture from kitchen order fulfillment.
4. Total lack of a relational audit ledger in PostgreSQL.

**Financial Readiness: CRITICAL FAILURE / BLOCKED**
