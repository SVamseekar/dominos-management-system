# Document 16 — Evidence Ledger & Forensic Traceability Matrix

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** Entire MaSoVa Codebase & Configuration Artifacts
**Evaluator:** Independent Go-Live Board (Forensic Code Audit, Security Engineering)
**Date:** September 2026
**Status:** **CERTIFIED EVIDENCE OF PRODUCTION REJECTION**

---

## 1. Forensic Evidence Ledger (Findings EV-001 to EV-050)

This ledger establishes complete, verifiable traceability from high-level board findings down to the exact file paths, line numbers, and verbatim code snippets in the MaSoVa repository.

```
+----------------------------------------------------------------------------------------------------+
|                                    EVIDENCE TRACEABILITY LEDGER                                    |
+--------+----------+----------------------------------------------+------------+--------------------+
| ID     | Category | Source File Path                             | Line(s)    | Severity           |
+--------+----------+----------------------------------------------+------------+--------------------+
| EV-001 | Security | commerce-service/.../SecurityConfig.java     | 51         | FATAL STOP-SHIP    |
| EV-002 | Security | commerce-service/.../OrderController.java    | 383-395    | FATAL STOP-SHIP    |
| EV-003 | Security | docker-compose.yml                           | 119        | CRITICAL           |
| EV-004 | Security | .github/workflows/deploy.yml                 | 90-95      | CRITICAL           |
| EV-005 | Security | docker-compose.yml                           | 35, 114    | FATAL STOP-SHIP    |
| EV-006 | Security | core-service/.../TokenRevocationService.java | 72-88      | FATAL STOP-SHIP    |
| EV-007 | Security | pom.xml (Root & submodules)                  | 142-148    | HIGH               |
| EV-008 | Security | infrastructure/postgres/01-init.sql          | 5-15       | HIGH               |
| EV-009 | Security | frontend/src/store/slices/authSlice.ts       | 46-50, 116 | HIGH               |
| EV-010 | Security | api-gateway/.../GatewaySecurityConfig.java   | 45-62      | HIGH               |
| EV-011 | Payment  | payment-service/.../OrderServiceClient.java  | 114-120    | FATAL STOP-SHIP    |
| EV-012 | Payment  | payment-service/.../PaymentService.java      | 360-364    | FATAL STOP-SHIP    |
| EV-013 | Payment  | payment-service/.../StripeGateway.java       | 85-99      | FATAL STOP-SHIP    |
| EV-014 | Payment  | payment-service/.../TransactionRepository.ja | 13         | FATAL STOP-SHIP    |
| EV-015 | Payment  | payment-service/.../V1__payment_schema.sql   | 5-40       | FATAL STOP-SHIP    |
| EV-016 | Payment  | payment-service/.../V1__payment_schema.sql   | 12, 27     | HIGH               |
| EV-017 | Payment  | commerce-service/.../OrderService.java       | 198, 258   | HIGH               |
| EV-018 | Payment  | payment-service/.../PaymentService.java      | 332-334    | HIGH               |
| EV-019 | Payment  | payment-service/.../StripeWebhookController  | 45-52      | CRITICAL           |
| EV-020 | Payment  | commerce-service/.../Order.java              | 45-65      | MEDIUM             |
| EV-021 | GDPR     | core-service/.../CustomerService.java        | 1185-1196  | FATAL STOP-SHIP    |
| EV-022 | GDPR     | commerce-service/.../OrderService.java       | 1405-1418  | FATAL STOP-SHIP    |
| EV-023 | GDPR     | commerce-service/.../OrderService.java       | 302        | FATAL STOP-SHIP    |
| EV-024 | GDPR     | logistics-service/.../DeliveryController.java| 390-400    | FATAL STOP-SHIP    |
| EV-025 | GDPR     | logistics-service/.../DeliveryTracking.java  | 45-46      | FATAL STOP-SHIP    |
| EV-026 | GDPR     | core-service/.../CustomerDataRetentionService| 95-96      | CRITICAL           |
| EV-027 | GDPR     | core-service/.../CustomerDataRetentionService| 101-104    | CRITICAL           |
| EV-028 | GDPR     | core-service/.../CustomerDataRetentionService| 123-126    | CRITICAL           |
| EV-029 | GDPR     | masova-support/src/masova_agent/main.py      | 45-70      | FATAL STOP-SHIP    |
| EV-030 | GDPR     | .github/workflows/deploy.yml                 | 92         | FATAL STOP-SHIP    |
| EV-031 | Database | commerce-service/.../OrderService.java       | 303-305    | FATAL STOP-SHIP    |
| EV-032 | Database | commerce-service/.../OrderService.java       | 308-312    | HIGH               |
| EV-033 | Database | core-service/.../application.yml             | 64-65      | HIGH               |
| EV-034 | Database | commerce-service/.../application.yml         | 63-64      | HIGH               |
| EV-035 | Database | docker-compose.yml                           | 45-55      | HIGH               |
| EV-036 | Database | infrastructure/postgres/01-init.sql          | 1-35       | HIGH               |
| EV-037 | DR / BCP | backups/                                     | Entire Dir | FATAL STOP-SHIP    |
| EV-038 | DR / BCP | docker-compose.yml                           | 1-200      | FATAL STOP-SHIP    |
| EV-039 | Observ.  | api-gateway/.../application.yml              | 87-95      | CRITICAL           |
| EV-040 | Observ.  | shared-models/.../CorrelationIdInterceptor.ja| 20-35      | HIGH               |
| EV-041 | Observ.  | shared-models/.../CorrelationIdFilter.java   | 30-55      | HIGH               |
| EV-042 | Release  | frontend/Dockerfile.production               | 13, 19     | FATAL STOP-SHIP    |
| EV-043 | AI Act   | intelligence-service/.../AnalyticsService.ja | 520-569    | FATAL STOP-SHIP    |
| EV-044 | AI Act   | frontend/src/pages/manager/agentCatalog.ts   | 55-80      | FATAL STOP-SHIP    |
| EV-045 | AI Act   | masova-support/.../chat.py                   | 25-40      | HIGH               |
| EV-046 | Fiscal   | commerce-service/.../GermanyTseFiscalSigner.ja| 24-35     | FATAL STOP-SHIP    |
| EV-047 | Fiscal   | commerce-service/.../FranceNf525FiscalSigner.j| 24-34     | FATAL STOP-SHIP    |
| EV-048 | Fiscal   | commerce-service/.../EuVatEngine.java         | 45-50      | FATAL STOP-SHIP    |
| EV-049 | Fiscal   | commerce-service/.../FiscalComplianceService  | 60-85      | HIGH               |
| EV-050 | Resilience| pom.xml / pom.xml submodules                | Entire Tree| CRITICAL           |
+--------+----------+----------------------------------------------+------------+--------------------+
```

---

## 2. Key Code Evidence Excerpts

### EV-001 & EV-002: Direct Gateway Bypass for Order Payment (`Free Food`)
- **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/config/SecurityConfig.java:51`
  ```java
  .requestMatchers("/api/orders/*/payment").permitAll()
  ```
- **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:383-395`
  ```java
  String internalHeader = httpRequest.getHeader("X-Internal-Service");
  if (internalHeader != null && !internalHeader.isBlank()) {
      // Bypasses JWT and role checks, immediately executes:
      orderService.updateOrderPaymentStatus(orderId, request.getStatus(), request.getTransactionId());
      return ResponseEntity.ok(ApiResponse.success("Order payment status updated successfully", ...));
  }
  ```

---

### EV-011 & EV-012: Payment Swallowing Exception via Circuit Breaker
- **File:** `payment-service/src/main/java/com/MaSoVa/payment/service/OrderServiceClient.java:114-120`
  ```java
  private void updateOrderPaymentStatusFallback(String orderId, String status, String transactionId, Exception ex) {
      log.warn("Circuit breaker fallback for updateOrderPaymentStatus. Order: {}, Status: {}, Transaction: {}, Error: {}",
              orderId, status, transactionId, ex.getMessage());
      // Don't throw exception - payment succeeded even if order update failed
      // This should be handled asynchronously or with retry logic
      // In production, this would trigger a compensating transaction or alert
  }
  ```
- **File:** `payment-service/src/main/java/com/MaSoVa/payment/service/PaymentService.java:363`
  ```java
  orderServiceClient.updateOrderPaymentStatus(transaction.getOrderId(), "PAID", transaction.getId());
  // Returns HTTP 200 OK to Stripe; order stays PENDING; kitchen never notified
  ```

---

### EV-013: Non-Idempotent Stripe Refund
- **File:** `payment-service/src/main/java/com/MaSoVa/payment/gateway/StripeGateway.java:91-96`
  ```java
  RefundCreateParams params = RefundCreateParams.builder()
          .setPaymentIntent(gatewayPaymentId)
          .setAmount(amountMinorUnits)
          .build();

  Refund refund = Refund.create(params); // NO RequestOptions with IdempotencyKey!
  ```

---

### EV-014 & EV-015: The Phantom PostgreSQL Payment Ledger
- **File:** `payment-service/src/main/java/com/MaSoVa/payment/repository/TransactionRepository.java:13`
  ```java
  public interface TransactionRepository extends MongoRepository<Transaction, String>
  ```
- **Finding:** Zero JPA entities or repositories exist in `payment-service`. The table `payment_schema.transactions` created by Flyway `V1__payment_schema.sql` receives zero writes.

---

### EV-021, EV-022, EV-024: Broken GDPR Erasure Cascade
- **File:** `core-service/src/main/java/com/MaSoVa/core/customer/service/CustomerService.java:1190-1196`
  ```java
  // TODO: Implement cascading anonymization to other services:
  // - order-service: anonymize customerName, customerEmail, customerPhone in orders
  // - payment-service: anonymize customerEmail, customerPhone in transactions
  ```
- **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:1405-1416`
  ```java
  public void anonymizeCustomerOrders(String customerId) {
      List<Order> orders = orderRepository.findByCustomerId(customerId);
      // orderRepository is Mongo only! orderJpaRepository is NEVER called.
      // PostgreSQL commerce_schema.orders retains cleartext PII permanently.
  }
  ```
- **File:** `logistics-service/src/main/java/com/MaSoVa/logistics/delivery/controller/DeliveryController.java:397-398`
  ```java
  // DeliveryTracking stores no customer PII — nothing to anonymise
  log.info("GDPR anonymize delivery tracking for customerId={}: no PII stored, no-op", customerId);
  // False: DeliveryTracking.java lines 45-46 store physical deliveryAddress!
  ```

---

### EV-042: Broken Frontend Production Dockerfile Build
- **File:** `frontend/Dockerfile.production:13, 19`
  ```dockerfile
  RUN npm ci --only=production
  COPY . .
  RUN npm run build
  ```
  `npm run build` runs `tsc -b && vite build`. `tsc` is in `devDependencies` and missing from container. Build fails instantly.

---

### EV-046 & EV-047: Fraudulent Fiscal Stubs
- **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/fiscal/GermanyTseFiscalSigner.java:27-32`
  ```java
  String tseTransactionId = "TSE-DE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
  String signatureValue = "STUB-TSE-SIG-" + order.getId();
  FiscalSignature sig = new FiscalSignature("DE", "TSE", tseTransactionId, signatureValue, null, Instant.now(), "STUB-DEVICE-001", true);
  ```

---

### EV-048: Illegal EU Consumer Price Surcharging
- **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/EuVatEngine.java:45-50`
  ```java
  BigDecimal net = BigDecimal.valueOf(item.getPrice()).multiply(...);
  BigDecimal vat = net.multiply(BigDecimal.valueOf(vatRatePct / 100.0));
  BigDecimal gross = net.add(vat); // Treats menu price as net; surcharges VAT at checkout!
  ```

---

**Board Certification Conclusion:** **EVIDENCE FULLY VERIFIED AND AUDITED**.

