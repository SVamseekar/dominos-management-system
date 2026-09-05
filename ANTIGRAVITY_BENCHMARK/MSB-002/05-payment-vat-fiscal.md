# 05 — Test 5: EU Payment, VAT, & Fiscalization Audit

**Benchmark:** MSB-002
**Title:** European Single-Restaurant Operational Readiness
**Perspective:** Financial & Tax Compliance Due Diligence for an EU Restaurant
**Standard of Evidence:** Strict source-code citations (`Repository`, `File`, `Symbol`, `Line`)
**Status Tags:** `[VERIFIED FROM SOURCE]`, `[STRONGLY INFERRED]`, `[REQUIRES RUNTIME VALIDATION]`, `[REQUIRES LEGAL/TAX REVIEW]`

---

## 1. End-to-End Financial Pipeline Trace

```
[Customer Checkout] ──► [Stripe PaymentIntent] ──► [Webhook Received] ──► [Order Marked Paid]
                                                           │
                                             ┌─────────────┴─────────────┐
                                      (If Circuit Breaks)         (If Refunded)
                                             │                           │
                                     [SILENT STATE DROP]       [CONCURRENT REFUND RACE]
                                     Order stays UNPAID        Money drained 2x
```

This audit traces the complete financial lifecycle:
`Order Creation → Payment Initiation → Webhook Confirmation → Refund Execution → Fiscal Signing & Tax Ledger`

---

## 2. Key Architectural Inquiries & Technical Findings

### 1. Who is Authoritative for Payment State?
* **Analysis:**
  * **External Gateway (Stripe):** Authoritative for whether money was captured from the customer's payment card.
  * **Payment Service (`payment-service`):** Authoritative for the internal transaction lifecycle (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`) in MongoDB `transactions`.
  * **Commerce Service (`commerce-service`):** Maintains its own decoupled copy of payment status on the `Order` entity (`paymentStatus: PENDING | PAID | FAILED`).
* **Source Citations:**
  * `payment-service/.../PaymentService.java:L351-363`
  * `commerce-service/.../OrderService.java:L1240-1270`
* **Finding:** State is distributed and triplicated without a two-phase commit (2PC) or saga orchestrator.

---

### 2. Can Payment State and Order State Diverge?
* **Status:** ❌ **YES (Frequent & Undetected Divergence)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `payment-service/.../OrderServiceClient.java:L43-45, L114-120`
* **Mechanics of Divergence:**
  1. Stripe webhook posts to `payment-service` confirming card capture.
  2. `PaymentService.java:L351` marks the internal transaction `SUCCESS`.
  3. `OrderServiceClient.java:L45` attempts to call `PATCH /api/orders/{id}/payment` on `commerce-service`.
  4. The call is wrapped in a Resilience4j circuit breaker:
     ```java
     @Retry(name = "orderService")
     @CircuitBreaker(name = "orderService", fallbackMethod = "updateOrderPaymentStatusFallback")
     public void updateOrderPaymentStatus(String orderId, String status, String transactionId) { ... }
     ```
  5. If `commerce-service` is unavailable, slow, or returning errors, the fallback method triggers:
     ```java
     private void updateOrderPaymentStatusFallback(String orderId, String status, String transactionId, Exception ex) {
         log.warn("Circuit breaker fallback for updateOrderPaymentStatus. Order: {}, Status: {}, Transaction: {}, Error: {}",
                 orderId, status, transactionId, ex.getMessage());
         // Don't throw exception - payment succeeded even if order update failed
     }
     ```
  6. The exception is swallowed. `payment-service` considers the job done and returns **HTTP 200 OK** to Stripe.
  7. **Divergence:** Stripe registers payment captured; `payment-service` registers transaction `SUCCESS`; but `commerce-service` still lists the order as `PENDING` (unpaid). The kitchen never cooks the food, and the customer receives nothing.

---

### 3. Are Retries Idempotent?
* **Stripe Webhook Retries:**
  * **Status:** ✅ **IDEMPOTENT / SAFE** `[VERIFIED FROM SOURCE]`
  * `PaymentService.java:L344-348`:
    ```java
    if (transaction.getStatus() == Transaction.PaymentStatus.SUCCESS) {
        log.info("Stripe PaymentIntent {} already processed for transaction: {}. Ignoring duplicate webhook.",
                result.getGatewayOrderId(), transaction.getId());
        return;
    }
    ```
    If Stripe retries delivery of the same webhook event, `PaymentService` detects `SUCCESS` and terminates cleanly without re-executing downstream side effects.
* **Order Creation Retries:**
  * **Status:** ❌ **NON-IDEMPOTENT** `[VERIFIED FROM SOURCE]`
  * If the client retries order submission due to network latency, `OrderService.java:L207` generates a new random order number and persists a duplicate order.

---

### 4. Is Duplicate Payment Safe?
* **Status:** ❌ **UNSAFE (Customer Overcharge Vulnerability)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `payment-service/.../PaymentService.java:L80-137`
* **Mechanics:**
  1. `initiatePayment()` does not check whether a payment intent has already been created for `request.getOrderId()`.
  2. If a customer clicks "Pay" twice or opens the checkout link in multiple tabs, two separate Stripe `PaymentIntent` objects are generated and saved as distinct transactions in MongoDB.
  3. If both are authorized/paid, both webhooks arrive. Each matches its respective `stripePaymentIntentId` and transitions to `SUCCESS`.
  4. Both payments capture funds from the customer's card. No automated refund or deduplication routine exists.

---

### 5. Are Refund Races Safe?
* **Status:** ❌ **CRITICAL CONCURRENCY VULNERABILITY** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `payment-service/.../RefundService.java:L169-183`
* **Mechanics:**
  1. In `RefundService.java:L169-181`, the available balance is calculated in application memory by summing existing refunds from `refundRepository.findByTransactionId(...)`:
     ```java
     BigDecimal totalCommitted = existingRefunds.stream()
             ...
             .map(Refund::getAmount)
             .reduce(BigDecimal.ZERO, BigDecimal::add);
     BigDecimal availableForRefund = transaction.getAmount().subtract(totalCommitted);
     if (request.getAmount().compareTo(availableForRefund) > 0) {
         throw new RuntimeException("Refund amount exceeds available amount.");
     }
     ```
  2. There is no pessimistic database lock (`PESSIMISTIC_WRITE`), no MongoDB document version lock, and no distributed Redis lock guarding this block.
  3. If two concurrent refund requests arrive simultaneously, both read the same `totalCommitted`, both pass the balance check, and both call `performGatewayRefund()` against Stripe.
  4. Stripe processes both refunds. A €50 order can result in €100 being drained from the merchant's bank account.

---

### 6. How is VAT Calculated?
* **Status:** ❌ **INCORRECT UNDER EU CONSUMER PRICING DIRECTIVES** `[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
* **Code Trace:**
  * `commerce-service/.../EuVatEngine.java:L41-58`
  * `commerce-service/.../OrderService.java:L187-205`
* **Violations & Defects:**
  1. **Net-to-Gross Inversion:**
     Under the EU Price Indication Directive (Directive 98/6/EC), German PAngV, and French consumer law, restaurant menu prices displayed to consumers MUST be VAT-inclusive. In `EuVatEngine.java:L45-50`:
     ```java
     BigDecimal net = BigDecimal.valueOf(item.getPrice()).multiply(BigDecimal.valueOf(item.getQuantity())).setScale(2, RoundingMode.HALF_UP);
     BigDecimal vat = net.multiply(BigDecimal.valueOf(vatRatePct / 100.0)).setScale(2, RoundingMode.HALF_UP);
     BigDecimal gross = net.add(vat);
     ```
     `EuVatEngine` assumes `item.getPrice()` is the **net** amount and adds VAT on top. For a €10.00 pizza at 19% VAT, MaSoVa calculates:
     `Net: €10.00 | VAT: €1.90 | Gross: €11.90`
     Instead of the legally correct inclusive extraction:
     `Gross: €10.00 | Net: €8.40 | VAT: €1.60`
  2. **Untaxed Delivery Fee:**
     `OrderService.java:L192-194` adds `deliveryFee` directly to total:
     `total = vatBreakdown.getTotalGrossAmount().add(BigDecimal.valueOf(deliveryFee)).doubleValue();`
     Delivery fees are not passed into `EuVatEngine.calculate()`, resulting in €0 VAT charged on delivery. In the EU, transport/delivery is an ancillary service subject to VAT.
  3. **Zero Tax in Order Entity:**
     `OrderService.java:L191,L220` sets `tax = 0.0` on the order whenever `countryCode != null`. Downstream services reading `order.getTax()` assume the order is tax-exempt.
  4. **Fallback to Indian GST:**
     If `storeServiceClient.getStore()` throws an exception (e.g. during core-service restart), `countryCode` is null. The system automatically defaults to India GST for Maharashtra (`OrderService.java:L198-204`).

---

### 7. Where is VAT Information Persisted?
* **MongoDB:**
  * Saved in `Order` document fields: `vatCountryCode`, `totalNetAmount`, `totalVatAmount`, `totalGrossAmount`, and embedded `vatBreakdown` (`Order.java:L54-61`).
* **PostgreSQL:**
  * Dual-written into `commerce_schema.orders` columns: `vat_country_code`, `total_net_amount`, `total_vat_amount`, `total_gross_amount`, and JSONB column `vat_breakdown` (`OrderJpaEntity.java:L115-135`).

---

### 8. Are Compliant Invoices & Receipts Generated?
* **Status:** ❌ **FAIL (Non-Compliant Under Directive 2006/112/EC)** `[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
* **Code Trace:**
  * `commerce-service/.../OrderService.java:L857-861`
  * `frontend/.../ReceiptGenerator.tsx:L35-58`
* **Findings:**
  1. Under Article 226 of the EU VAT Directive (2006/112/EC), an invoice requires:
     * A sequential invoice number based on one or more series.
     * Full legal name and address of the taxable person and customer.
     * VAT identification number of the supplier.
     * Quantity and nature of the goods supplied.
     * Extent and breakdown of tax rates applied.
  2. MaSoVa generates order numbers using a random string:
     `"ORD" + timestamp.substring(length - 6) + randomNum;`
     This does not constitute a sequential invoice series.
  3. The frontend `ReceiptGenerator.tsx` produces an HTML page defaulting to Bangalore, India address details and `Tax (5% GST)`. No compliant PDF invoice is ever generated by the backend.

---

### 9. Does Fiscal Signing Actually Occur?
* **Status:** ❌ **FAIL (Pure Stub Implementation)** `[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
* **Code Trace:**
  * `commerce-service/.../FiscalSigningService.java:L57-75`
  * `commerce-service/.../GermanyTseFiscalSigner.java:L20-40`
  * `commerce-service/.../FranceNf525FiscalSigner.java:L19-39`
  * `commerce-service/.../ItalyRtFiscalSigner.java`
  * `commerce-service/.../OrderService.java:L1379-1399`
* **Findings:**
  1. `GermanyTseFiscalSigner.java:L27-32` stubs the German TSE requirement:
     ```java
     String tseTransactionId = "TSE-DE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
     String signatureValue = "STUB-TSE-SIG-" + order.getId();
     FiscalSignature sig = new FiscalSignature("DE", "TSE", tseTransactionId, signatureValue, null, Instant.now(), "STUB-DEVICE-001", true);
     ```
  2. `FranceNf525FiscalSigner.java:L26-32` stubs the French NF525 requirement with `"STUB-NF525-SIG-"`.
  3. **Zero Integration:** No certified hardware device, USB TSE, SD-card TSE, or cloud fiscal API (e.g. Fiskaly, Swissbit, EFSTA) is ever called.
  4. **Omission on Delivery:** In `OrderService.java:L1379-1399` (`markOrderDelivered`), deliveries completed via driver OTP **never call `fiscalSigningService.signOrder()`**. Every delivery transaction bypasses fiscal signing entirely.

---

### 10. Country-Neutral vs. Country-Specific Assessment
* **Status:** **Fragile Mixed Implementation**
* `EuVatConfiguration.java` hardcodes rate tables for 6 countries (`DE`, `FR`, `IT`, `NL`, `BE`, `HU`), completely missing the other 21 EU Member States.
* Fiscalization is country-specific in name (`GermanyTseFiscalSigner`, `FranceNf525FiscalSigner`), but since all implementations are stubs, no country's fiscalization laws are satisfied.

---

## 3. Financial & Tax Readiness Verdict

| Audit Item              | Legal / Operational Standard                 | MaSoVa Implementation                     |  Verdict   |
| :---------------------- | :------------------------------------------- | :---------------------------------------- | :--------: |
| **Payment State Sync**  | Zero divergence between charged & fulfilled  | Circuit breaker swallows failures         | ❌ **FAIL** |
| **Double Payment**      | Reject/refund duplicate intent on same order | Creates duplicate intents; double charges | ❌ **FAIL** |
| **Refund Concurrency**  | Atomic mutex on balance deduction            | Unlocked MongoDB reads; double refunds    | ❌ **FAIL** |
| **Price Display (VAT)** | Prices must be VAT-inclusive                 | Treats prices as net; adds VAT on top     | ❌ **FAIL** |
| **Delivery Tax**        | Delivery fee subject to VAT                  | Delivery fee untaxed                      | ❌ **FAIL** |
| **Invoice Numbering**   | Sequential numbering series (Art. 226)       | Random non-sequential strings             | ❌ **FAIL** |
| **Fiscal Security**     | Certified TSE / NF525 signatures             | Fake string literals (`STUB-TSE-SIG-`)    | ❌ **FAIL** |
| **POD Fiscalization**   | All sales must be fiscally signed            | Delivery orders completely bypass signer  | ❌ **FAIL** |

**Conclusion:** Deploying this financial pipeline in the EU will result in immediate pricing violations, customer billing disputes, chargebacks, double-drained refund accounts, and severe tax fraud sanctions.

