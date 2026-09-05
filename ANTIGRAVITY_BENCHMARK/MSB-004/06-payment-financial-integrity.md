# Document 06 — Payment & Financial Integrity Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** MaSoVa Payment Service, Commerce Service, Stripe Gateway, Flyway Migrations
**Evaluator:** Independent Go-Live Board (Production Engineering, Cybersecurity, Financial Systems)
**Date:** September 2026
**Status:** **REJECTED (FATAL FINANCIAL DEFECTS)**

---

## 1. Executive Summary & Core Question Verdict

### The Core Financial Question:
> **"Can the system prove what happened to every single euro?"**

### The Board's Definitive Answer:
# **NO.**

The MaSoVa payment and financial subsystem suffers from structural design flaws, unhandled distributed transaction failure modes, non-idempotent refund execution, and complete absence of an immutable double-entry ledger. Under normal network latency or intermittent downstream outages, the system will **silently charge customer credit cards while stranding orders in unpaid states**, fail to dispatch food, double-refund merchant balances, and generate irreconcilable accounting discrepancies across jurisdictions.

```
+----------------------------------------------------------------------------------------------------+
|                                    FINANCIAL INTEGRITY SCORECARD                                   |
+------------------------------------+-----------------------+---------------------------------------+
| Financial Capability               | Status                | Finding Code / Root Cause             |
+------------------------------------+-----------------------+---------------------------------------+
| End-to-End Payment State Machine   | FATAL DEFECT          | PAY-01: Silent order drop on CB fallb.|
| Stripe Refund Idempotency          | FATAL DEFECT          | PAY-02: Missing IdempotencyKey        |
| PostgreSQL Financial Dual-Write    | COMPLETE PHANTOM      | DB-01: Zero JPA entities in service   |
| Double-Entry General Ledger        | MISSING ENTIRELY      | No debit/credit balance records       |
| Multi-Currency & Rounding Precision| CRITICAL DEFECT       | INR fallbacks; unhandled rounding     |
| Reversal & Dispute Reconciliation  | UNIMPLEMENTED         | Stubbed chargeback endpoints          |
+------------------------------------+-----------------------+---------------------------------------+
```

---

## 2. Deep Technical Breakdown of Financial Defects

### 2.1 Fatal Defect PAY-01: Silent Payment State Loss via Circuit Breaker Fallback

#### The Architecture Flow
When a customer pays via Stripe, the payment processing flow relies on an asynchronous webhook callback from Stripe to `payment-service`:
1. Customer enters credit card details via Stripe Elements.
2. Stripe processes the charge and emits a `payment_intent.succeeded` webhook to `payment-service` endpoint `/api/payments/webhook/stripe`.
3. `PaymentService.handleStripePaymentCaptured` processes the event, marks the MongoDB transaction `SUCCESS`, and makes a synchronous REST call to `commerce-service` via `OrderServiceClient.updateOrderPaymentStatus(orderId, "PAID", transactionId)`.
4. The webhook controller returns HTTP 200 OK to Stripe.

#### The Code Inspection
In `payment-service/src/main/java/com/MaSoVa/payment/service/OrderServiceClient.java`:
```java
// Lines 67-73
@CircuitBreaker(name = "orderService", fallbackMethod = "updateOrderPaymentStatusFallback")
public boolean updateOrderPaymentStatus(String orderId, String status, String transactionId) {
    String url = orderServiceUrl + "/api/orders/" + orderId + "/payment";
    // REST call to commerce-service...
}

// Lines 114-120
private void updateOrderPaymentStatusFallback(String orderId, String status, String transactionId, Exception ex) {
    log.warn("Circuit breaker fallback for updateOrderPaymentStatus. Order: {}, Status: {}, Transaction: {}, Error: {}",
            orderId, status, transactionId, ex.getMessage());
    // Don't throw exception - payment succeeded even if order update failed
    // This should be handled asynchronously or with retry logic
    // In production, this would trigger a compensating transaction or alert
}
```

In `payment-service/src/main/java/com/MaSoVa/payment/service/PaymentService.java`:
```java
// Lines 360-363
log.info("Stripe payment captured and transaction completed. Transaction ID: {}", transaction.getId());

orderServiceClient.updateOrderPaymentStatus(transaction.getOrderId(), "PAID", transaction.getId());

paymentEventPublisher.publishPaymentCompleted(...);
```

#### The Production Catastrophe Mode
- If `commerce-service` experiences a GC pause, database lock, temporary network partition, or deployment restart:
  1. `OrderServiceClient.updateOrderPaymentStatus` fails or times out.
  2. The Resilience4j circuit breaker routes the call to `updateOrderPaymentStatusFallback`.
  3. `updateOrderPaymentStatusFallback` logs a warning and **swallows the exception**, returning cleanly without rethrowing.
  4. `PaymentService.java` continues execution without knowing the order update failed.
  5. The Stripe webhook HTTP handler returns **HTTP 200 OK** to Stripe.
  6. **Stripe considers the webhook successfully acknowledged and will NEVER retry it.**
  7. `payment-service` has no transactional outbox table or background retry daemon to replay failed order notifications.
  8. In `commerce-service`, the order remains permanently in state `PENDING` or `CREATED`.
  9. The Kitchen Display System (KDS) never receives the order; food is never prepared; the customer never receives their meal.
  10. The customer's credit card has been charged real euros, creating an immediate consumer dispute and regulatory breach under European consumer protection laws (Directive 2011/83/EU).

---

### 2.2 Fatal Defect PAY-02: Non-Idempotent Stripe Refunds (Merchant Account Drain)

Under European e-commerce rules, order cancellations and customer dispute resolutions require issuing partial or full refunds. The Stripe API requires an `IdempotencyKey` header on mutation calls to prevent duplicate charge reversals during network timeouts or client retries.

#### The Code Inspection
In `payment-service/src/main/java/com/MaSoVa/payment/gateway/StripeGateway.java`:
```java
// Lines 85-99
@Override
public String refund(String gatewayPaymentId, BigDecimal amount, String speed) throws Exception {
    PaymentIntent intent = PaymentIntent.retrieve(gatewayPaymentId);
    String currency = intent.getCurrency() != null ? intent.getCurrency().toUpperCase() : "EUR";
    long amountMinorUnits = CurrencyUnits.majorToStripeAmount(amount, currency);

    RefundCreateParams params = RefundCreateParams.builder()
            .setPaymentIntent(gatewayPaymentId)
            .setAmount(amountMinorUnits)
            .build();

    Refund refund = Refund.create(params);
    log.info("Stripe Refund created: {} for paymentIntent={}", refund.getId(), gatewayPaymentId);
    return refund.getId();
}
```

#### The Vulnerability Analysis
- Notice that `Refund.create(params)` is called **without** `RequestOptions`:
  ```java
  // Required Stripe SDK pattern:
  RequestOptions options = RequestOptions.builder().setIdempotencyKey("refund_" + transactionId).build();
  Refund refund = Refund.create(params, options);
  ```
- If a store manager issues a refund for a €100 catering order, and the HTTP request between `payment-service` and `api.stripe.com` experiences a socket timeout (common during peak traffic), the frontend or upstream caller retries the request.
- Because no `IdempotencyKey` was passed, Stripe executes a second distinct refund against the merchant's balance.
- If repeated or automated via client retry loops, the merchant's Stripe account will be rapidly drained of operating capital.

---

### 2.3 Fatal Defect DB-01: The Mythical PostgreSQL Financial Dual-Write

The engineering team's architectural runbook claims a "Phase 2 Dual-Write architecture" where all transactions are synchronized to relational PostgreSQL for financial reporting and auditing.

#### The Reality: Zero JPA Code in Payment Service
1. **Flyway Migration Creates Tables:**
   `payment-service/src/main/resources/db/migration/V1__payment_schema.sql` creates `payment_schema.transactions` and `payment_schema.refunds`.
2. **Zero Entity Mappings:**
   An exhaustive search of `payment-service` reveals **zero JPA entities** (`@Entity`), zero entity managers, and zero Flyway execution configs in the Java source.
3. **Repository is Pure MongoDB:**
   `payment-service/src/main/java/com/MaSoVa/payment/repository/TransactionRepository.java`:
   ```java
   @Repository
   public interface TransactionRepository extends MongoRepository<Transaction, String>
   ```
4. **Conclusion:**
   The PostgreSQL financial schema is **100% phantom**. Not a single byte of transaction or refund data has ever been written to PostgreSQL by `payment-service`. The table `payment_schema.transactions` remains empty in perpetuity. Any financial auditor or executive querying PostgreSQL to reconcile revenue is looking at a mirage.

---

### 2.4 Currency Confusion & Indian Rupee Defaults

While the platform is intended for European deployment (where the statutory currencies are EUR, GBP, CHF, SEK, PLN), default configs throughout the payment flow hardcode Indian Rupee (`INR`) and Maharashtra state tax assumptions.

1. **Flyway Table Defaults (`V1__payment_schema.sql:12, 27`):**
   ```sql
   amount   DECIMAL(12,2) NOT NULL, -- INR, 2 d.p.
   currency VARCHAR(10)   NOT NULL DEFAULT 'INR',
   ```
2. **Order Service Fallbacks (`OrderService.java:198, 258`):**
   If store metadata fetch fails or is null, currency defaults to `INR` and tax rates apply Indian GST (CGST + SGST) instead of European VAT.
3. **Stripe Minor Unit Calculation:**
   European decimal handling must strictly follow ISO 4217 minor unit conversions (e.g. 1 EUR = 100 cents). When fallback currency switching occurs, amounts calculated in cents vs paise lead to order of magnitude pricing errors.

---

## 3. Absence of Double-Entry Accounting & Reconciliation

In an enterprise European restaurant platform handling millions of euros across multiple franchised entities, single-entry mutable document storage is legally and operationally disqualifying.

### Deficiencies:
- **Mutable Transaction Records:** In `payment-service`, transaction statuses are modified in-place:
  ```java
  transaction.setStatus(Transaction.PaymentStatus.SUCCESS);
  transactionRepository.save(transaction);
  ```
  If a record is overwritten or corrupted, there is no historical journal showing previous states, debit accounts, credit accounts, or counterparty balances.
- **No Escrow or Split-Payout Ledger:** Platform fees, restaurant payouts, delivery driver earnings, and tax withholding are not tracked as balance sheet liabilities.
- **No Gateway Reconciliation Daemon:** There is no cron or daily job comparing Stripe `BalanceTransaction` settlement batches against local database records to detect uncaptured payments, unexpected chargebacks, or gateway fee variances.

---

## 4. Financial Go-Live Gate: Mandatory Fixes

The following five engineering requirements must be completed and verified before any European payment processing can be sanctioned:

1. **Transactional Outbox for Payment Events:**
   Replace the synchronous REST call to `commerce-service` with a transactional outbox table written in the same atomic database transaction as the payment status change, polled by a reliable de-duplicating event publisher.
2. **Strict Stripe Idempotency:**
   Inject deterministic idempotency keys (`storeId + "_" + orderId + "_refund"`) into every Stripe SDK API call.
3. **Realize Relational Dual-Write or Deprecate:**
   Implement true JPA dual-write with two-phase commit verification or CDC (Debezium), or officially decommission the misleading Flyway SQL scripts.
4. **Immutable Double-Entry Ledger:**
   Implement an append-only ledger schema (`journal_entries`, `ledger_accounts`, `debits`, `credits`) adhering to DIN/ISO standard accounting practices.
5. **Automated Gateway Reconciliation Engine:**
   Implement automated end-of-day reconciliation matching bank settlement files against internal ledger transactions.

---

**Board Certification Conclusion:** **REJECT**. The platform cannot guarantee financial integrity or protect merchant and customer funds.

