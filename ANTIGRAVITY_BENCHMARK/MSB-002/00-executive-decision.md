# 00 — Executive Decision: European Single-Restaurant Operational Readiness

**Benchmark:** MSB-002
**Title:** European Single-Restaurant Operational Readiness
**Target Ecosystem:** MaSoVa Restaurant Management Platform
**Auditor Perspective:** Independent Technical Due-Diligence Engineer for a European Single-Restaurant Owner/Operator
**Standard of Evidence:** Strict source-code citations (`Repository`, `File`, `Symbol`, `Line`)
**Status Tags:** `[VERIFIED FROM SOURCE]`, `[STRONGLY INFERRED]`, `[REQUIRES RUNTIME VALIDATION]`, `[REQUIRES LEGAL/TAX REVIEW]`
**Date of Evaluation:** September 2026

---

## 1. The Core Question

> **Can a real European Union restaurant owner safely depend on the current MaSoVa implementation to operate their business tomorrow?**

### The Verdict: **RED — DO NOT DEPLOY**

**MaSoVa is not operationally, financially, legally, or technically ready to power a real restaurant in the European Union.**

While the codebase exhibits ambitious microservice modularity, modern Spring Boot 3.2 conventions, and an advanced LangGraph/LangChain human-in-the-loop AI support architecture, the software suffers from **systemic cross-repository contract breakdowns, silent distributed failure modes, fatal financial race conditions, gross VAT calculation errors, non-compliant stubbed fiscalization, and persistent GDPR erasure loopholes**.

If a restaurant owner opens their doors tomorrow running this software:
1. **Drivers cannot deliver orders:** The driver mobile application (`MaSoVaCrewApp`) queries deprecated endpoints that return **HTTP 404** and submits status updates with HTTP methods that return **HTTP 405 Method Not Allowed**.
2. **Customers cannot cancel orders:** The customer mobile application (`masova-mobile`) dispatches HTTP `DELETE /api/orders/{id}`, which is rejected with **HTTP 403 Forbidden** by the backend.
3. **Food will be given away unpaid:** Microservice HTTP ports are directly exposed on the host network without internal token authentication, allowing any visitor on restaurant Wi-Fi to forge `X-Internal-Service` headers and mark orders as `PAID` without payment.
4. **Paid orders will be lost:** Under transient inter-service latency, the payment service's Resilience4j circuit breaker trips and **silently swallows failed order updates**, returning HTTP 200 to Stripe while leaving the kitchen with zero record of the order.
5. **Merchant funds will be double-drained:** The refund service validates balances in MongoDB without transactional or distributed locks, allowing concurrent refund requests to double-refund customers at the gateway level.
6. **Tax authorities will levy severe penalties:** German TSE, French NF525, and Italian RT fiscal signers are purely fictitious stubs returning string literals (`STUB-TSE-SIG-`). Furthermore, proof-of-delivery completions bypass the fiscal signer entirely.
7. **Customer prices and VAT will violate EU laws:** The VAT engine treats consumer menu prices as net amounts and adds VAT on top (violating EU price display directives), omits VAT on delivery fees, and silently defaults to Indian Maharashtra GST if store resolution encounters a network glitch.
8. **GDPR Article 17 requests will violate the law:** The "Right to be Forgotten" routine updates only MongoDB, leaving plaintext customer names, phone numbers, and delivery addresses unexpunged in PostgreSQL.

---

## 2. High-Level Readiness Scorecard

| Operational Domain                  |    Status     | Key Finding                                                                                                             | Source Citation                                           |
| :---------------------------------- | :-----------: | :---------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| **Store Setup & Identity**          |  ❌ **FAIL**   | Store code validation regex hardcoded to `^DOM\d{3}$`; currency fields hardcoded as INR in nested zones.                | `shared-models/.../Store.java:L41,L428`                   |
| **Menu & Allergen Governance**      | ⚠️ **PARTIAL** | 14 EU allergens defined and gated on menu availability; mobile displays chips, but cross-contamination warnings absent. | `commerce-service/.../MenuService.java:L31-34`            |
| **Customer Ordering & Cart**        |  ❌ **FAIL**   | Inclusive VAT inverted; menu prices treated as net; delivery fee untaxed; fallback to India GST on store timeout.       | `commerce-service/.../EuVatEngine.java:L45-53`            |
| **Customer Order Cancellation**     |  ❌ **FAIL**   | Customer mobile app issues `DELETE /orders/{id}`, rejected with HTTP 403 Forbidden.                                     | `masova-mobile/.../orderApi.ts:L59`                       |
| **Payment Processing (Stripe)**     | ⚠️ **PARTIAL** | Stripe webhook idempotent for same PaymentIntent, but duplicate user taps create duplicate charges.                     | `payment-service/.../PaymentService.java:L107-137`        |
| **Inter-Service Resilience**        |  ❌ **FAIL**   | Circuit breaker drops payment status updates silently; customer charged, kitchen never notified.                        | `payment-service/.../OrderServiceClient.java:L114-120`    |
| **Kitchen Operations (KDS)**        | ⚠️ **PARTIAL** | Real-time WebSocket delivery functional, but concurrent stage advances crash with unhandled optimistic locking error.   | `commerce-service/.../Order.java:L32-33`                  |
| **Driver & Fulfillment Operations** |  ❌ **FAIL**   | Driver app completely broken: `GET /orders/status/{status}` (404), `PATCH /orders/{id}/status` (405).                   | `MaSoVaCrewApp/.../orderApi.ts:L83,L88`                   |
| **Proof of Delivery (POD)**         |  ❌ **FAIL**   | OTP verification succeeds in MongoDB, but completely omits RabbitMQ event publication and fiscal signing.               | `commerce-service/.../OrderService.java:L1379-1399`       |
| **Refunds & Approvals**             |  ❌ **FAIL**   | Zero mutex or locking on MongoDB refund validation; concurrent calls create double refunds.                             | `payment-service/.../RefundService.java:L169-183`         |
| **European Fiscalization**          |  ❌ **FAIL**   | TSE (DE), NF525 (FR), RT (IT) are hardcoded stubs; POD deliveries never call the signer.                                | `commerce-service/.../GermanyTseFiscalSigner.java:L27-32` |
| **EU VAT & Invoicing**              |  ❌ **FAIL**   | Order numbers are random strings (`ORD` + millis + rand), not sequential invoice series; receipt is browser HTML.       | `commerce-service/.../OrderService.java:L857-861`         |
| **GDPR Compliance (Art. 15, 17)**   |  ❌ **FAIL**   | Right-to-erasure updates MongoDB only; PostgreSQL `commerce_schema.orders` retains plaintext PII.                       | `commerce-service/.../OrderService.java:L1405-1418`       |
| **Perimeter & Role Security**       |  ❌ **FAIL**   | Direct Docker host port exposure permits bypassing API Gateway and forging `X-Internal-Service` to mark orders paid.    | `commerce-service/.../OrderController.java:L383-395`      |
| **AI Systems (EU AI Act)**          | ⚠️ **PARTIAL** | Excellent HITL proposal gates for refunds/cancellation; lacks Art. 50 AI disclosure; workplace AI touches Annex III.    | `masova-support/.../backend_tools.py:L371-422`            |

---

## 3. The 5 Fatal Flaws That Forbid Deployment

### 1. The Broken Fulfillment Bridge (Driver App Contract Collapse)
`[VERIFIED FROM SOURCE]`
A restaurant cannot deliver food if drivers cannot access the system. `MaSoVaCrewApp` was developed against an obsolete version of the commerce API. In `MaSoVaCrewApp/src/store/api/orderApi.ts:L83`, the app invokes `GET /orders/status/{status}`. In `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L37,L144`, this path is explicitly removed and replaced by query parameters. Furthermore, line 88 of `orderApi.ts` issues `PATCH /orders/{orderId}/status`, whereas `OrderController.java:L205` strictly requires `POST /{orderId}/status`. The mobile driver app receives **HTTP 404** when fetching orders and **HTTP 405** when updating status. The delivery fleet is completely inoperable.

### 2. Perimeter Bypass & Unauthenticated Order Falsification
`[VERIFIED FROM SOURCE]`
In `docker-compose.yml:L119`, `commerce-service` exposes port `8084:8084` directly to the host network. In `commerce-service/.../SecurityConfig.java:L51`, `/api/orders/*/payment` is declared as a public endpoint. In `OrderController.java:L383-395`, the controller inspects the incoming request header:
```java
String internalCaller = httpRequest.getHeader("X-Internal-Service");
if (internalCaller == null || internalCaller.isBlank()) {
    // Check Spring Security role
}
return ResponseEntity.ok(orderService.updatePaymentStatus(orderId, request.getStatus(), request.getTransactionId()));
```
If `X-Internal-Service` is provided (e.g., `X-Internal-Service: payment-service`), the controller skips all authentication and role checks. Any client on the restaurant local network can make a direct `PATCH` request to `http://<host>:8084/api/orders/{id}/payment` with `{"status": "PAID"}` and spoofed internal header, causing unpaid orders to enter the kitchen queue as paid.

### 3. Silent Payment Black Hole (Resilience4j Fallback Hazard)
`[VERIFIED FROM SOURCE]`
In `payment-service/.../OrderServiceClient.java:L43-45`, inter-service status updates are protected by `@CircuitBreaker(name = "orderService", fallbackMethod = "updateOrderPaymentStatusFallback")`. Lines 114-120 implement the fallback:
```java
private void updateOrderPaymentStatusFallback(String orderId, String status, String transactionId, Exception ex) {
    log.warn("Circuit breaker fallback for updateOrderPaymentStatus. Order: {}, Status: {}, Transaction: {}, Error: {}",
            orderId, status, transactionId, ex.getMessage());
    // Don't throw exception - payment succeeded even if order update failed
}
```
When `commerce-service` is experiencing high load or restart, the circuit opens. The exception is swallowed. `StripeWebhookController.java:L53` returns `200 OK` ("Webhook processed") to Stripe. Stripe marks the webhook as successfully acknowledged. The customer's credit card has been charged, but `commerce-service` never receives the status update. The order remains in status `PENDING` (unpaid) forever. The kitchen never receives an order ticket.

### 4. Criminal Tax Evasion Liability (Mock Fiscal Signatures)
`[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
Under German §146a AO (KassenSichV), French Article 88 de la loi de finances (NF525), and Italian Legge di Bilancio (Registratore Telematico), electronic point-of-sale systems must cryptographically record transactions using a certified Technical Security System (TSE) or certified hardware/cloud module. `commerce-service/.../GermanyTseFiscalSigner.java:L27-32` produces fake strings:
```java
String tseTransactionId = "TSE-DE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
String signatureValue = "STUB-TSE-SIG-" + order.getId();
```
No communication with a physical USB/microSD TSE or cloud TSE (Fiskaly, Swissbit, Epson) exists. To compound the liability, in `commerce-service/.../OrderService.java:L1379-1399` (`markOrderDelivered`), orders completed via driver proof-of-delivery **never invoke `fiscalSigningService.signOrder()`**. Operating this system exposes the restaurant owner to criminal tax fraud penalties, immediate commercial closure, and fines up to €25,000 per violation in Germany or €7,500 per terminal in France.

### 5. Inverted Dual-Write & GDPR Article 17 Erasure Violation
`[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
While architectural documentation claims PostgreSQL is the primary source of truth, `OrderService.java:L271-305` and `UserService.java:L137` write to MongoDB first, and execute PostgreSQL writes inside an unmonitored `try/catch` block that logs a warning and proceeds. Furthermore, when a customer exercises their GDPR Article 17 "Right to be Forgotten", `OrderService.java:L1405-1418` (`anonymizeCustomerOrders`) overwrites personal data only in `orderRepository` (MongoDB). It never updates `orderJpaRepository` (PostgreSQL). As a result, plaintext customer names, email addresses, phone numbers, and delivery addresses remain indefinitely stored in the relational database `commerce_schema.orders`.

---

## 4. Auditor Conclusion & Recommendation

The restaurant owner **must not deploy MaSoVa tomorrow**.

To achieve a **YELLOW** (operable under strict manual compensating controls) or **GREEN** (fully production-ready) status, the platform requires an estimated **4 to 6 weeks of dedicated engineering**:
1. Synchronize the mobile applications (`MaSoVaCrewApp` and `masova-mobile`) with the backend API contract.
2. Close Docker host port bindings (`8084`, `8085`, `8086`, `8089`) and secure internal service-to-service calls using mutual TLS or HMAC-signed headers.
3. Replace the silent Resilience4j payment fallback with a durable transactional outbox or dead-letter queue.
4. Integrate a certified European cloud fiscalization API (such as Fiskaly or EFSTA).
5. Correct the VAT calculation engine to extract VAT from gross prices and tax delivery fees.
6. Extend GDPR anonymization routines to cover PostgreSQL entities and establish compliant 10-year accounting retention partitions.

The following comprehensive technical reports detail the exact findings, code citations, and step-by-step remediation plans.

