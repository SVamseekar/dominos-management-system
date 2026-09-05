# 20 - First Architectural Verdict & Ranked Findings

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Verdict

The MaSoVa multi-repository software ecosystem exhibits critical architectural divergence between its documented specifications and its physical implementation. While individual backend microservices demonstrate sophisticated design patterns (Spring Cloud Gateway, RabbitMQ event topography, and reactive security filters), the cross-repository integration surface is critically fractured.

The system cannot fulfill an end-to-end delivery order via its driver mobile application, locks customers out of order cancellation, silently drops payment state under transient network latency, bypasses mandatory European fiscal compliance signing on verified deliveries, violates GDPR Article 17 erasure mandates, and permits unauthenticated payment state manipulation via direct network port exposure.

---

## 2. Ranked Findings Inventory

```
+---------------------------------------------------------------------------------------------------+
| ID       | Severity | Title                                                                       |
+---------------------------------------------------------------------------------------------------+
| CRIT-01  | CRITICAL | Proof-of-Delivery Event & Fiscal Signing Black Hole in markOrderDelivered   |
| CRIT-02  | CRITICAL | Complete Inversion of Dual-Write Persistence & Swallowed PostgreSQL Errors |
| CRIT-03  | CRITICAL | Driver Mobile App Total Contract Breakdown (HTTP 404 & HTTP 405)           |
| CRIT-04  | CRITICAL | Customer Mobile Order Cancellation HTTP 403 Lockout                         |
| CRIT-05  | CRITICAL | Delivery Stage Desynchronization & Disappearing OTP on OUT_FOR_DELIVERY     |
| CRIT-06  | CRITICAL | Public Unauthenticated Payment Bypass via Exposed Port & Header Spoofing   |
| CRIT-07  | CRITICAL | Circuit Breaker Fallback Swallows Payment State Updates                     |
| CRIT-08  | CRITICAL | TOCTOU Concurrency Race Condition Enabling Double Refunding                |
| CRIT-09  | CRITICAL | GDPR Article 17 Erasure Violation: PostgreSQL Retains Plaintext PII        |
| HIGH-01  | HIGH     | Cross-Store Mutating Operations Omit Tenant Isolation Checks                |
| HIGH-02  | HIGH     | Token Revocation Blacklist Fails Open on Redis Outage or Omission           |
| HIGH-03  | HIGH     | AI Operations Fleet Agent Crashes on Comma-Separated Status Parameters      |
| HIGH-04  | HIGH     | State Machine Terminal State Cancellation Bypass for SERVED & COMPLETED    |
| HIGH-05  | HIGH     | Absence of Transactional Outbox Pattern for RabbitMQ Publishing            |
| MED-01   | MEDIUM   | Missing Consumer Idempotency Ledger in Analytics Ingestion                 |
| MED-02   | MEDIUM   | CustomerServiceClient.updateOrderStats is a Dead No-Op                      |
| LOW-01   | LOW      | Return Type Schema Mismatch on Public Track Order Endpoint                 |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Detailed Audit Dossier

### CRIT-01: Proof-of-Delivery Event & Fiscal Signing Black Hole
* **Repositories:** `masova-platform` (`commerce-service`, `logistics-service`)
* **Citations:** `commerce-service/.../OrderService.java:L1379-1399`, `logistics-service/.../ProofOfDeliveryService.java:L221`
* **Impact:** Physical deliveries completed via OTP fail to emit RabbitMQ events, skip customer loyalty calculations, fail to push WebSocket updates, and bypass EU fiscal receipt signing.
* **Remediation:** Refactor `markOrderDelivered` to invoke `fiscalSigningService.signOrder()`, `orderEventPublisher.publishOrderStatusChanged()`, and `webSocketController.sendOrderUpdateToCustomer()`.

---

### CRIT-02: Complete Inversion of Dual-Write Persistence
* **Repositories:** `masova-platform` (`core-service`, `commerce-service`, `payment-service`, `logistics-service`)
* **Citations:** `core-service/.../UserService.java:L137-144`, `commerce-service/.../OrderService.java:L271, L712-725`, `docs/guidelines/domain-rules.md:L37`, `docs/guidelines/decisions.md:L66-69`
* **Impact:** Direct contradiction of Decision D08. MongoDB is written first; PostgreSQL errors are caught and swallowed; PostgreSQL is completely missing from payment and logistics services.
* **Remediation:** Enforce synchronous PostgreSQL JPA transactions as the primary commit, with asynchronous or CDC-driven MongoDB projections, or formally revise Decision D08.

---

### CRIT-03: Driver Mobile App Total Contract Breakdown
* **Repositories:** `MaSoVaCrewApp` vs `masova-platform` (`commerce-service`)
* **Citations:** `MaSoVaCrewApp/src/store/api/orderApi.ts:L83, L88-91` vs `commerce-service/.../OrderController.java:L144, L205`
* **Impact:** Drivers receive HTTP 404 when loading assigned deliveries and HTTP 405 when marking deliveries complete.
* **Remediation:** Update `orderApi.ts` to query `GET /orders?status=DISPATCHED` and send `POST /orders/{orderId}/status`.

---

### CRIT-04: Customer Mobile Order Cancellation HTTP 403 Lockout
* **Repositories:** `masova-mobile` vs `masova-platform` (`commerce-service`)
* **Citations:** `masova-mobile/src/services/api/orderApi.ts:L59` vs `commerce-service/.../OrderController.java:L308, L325`
* **Impact:** Customers cannot cancel orders; tapping "Cancel" sends `DELETE` which requires `ROLE_STAFF`.
* **Remediation:** Update mobile client to call `POST /orders/{orderId}/cancel-request`.

---

### CRIT-05: Delivery Stage Desynchronization & Disappearing OTP
* **Repositories:** `masova-mobile` vs `masova-platform` (`shared-models`)
* **Citations:** `masova-mobile/.../OrderTrackingScreen.tsx:L36-43, L160` vs `shared-models/.../OrderStatus.java:L10`
* **Impact:** `OUT_FOR_DELIVERY` status yields stage index `-1`. Progress bar resets to gray, and delivery OTP card vanishes from customer device.
* **Remediation:** Add `OUT_FOR_DELIVERY` to `DELIVERY_ORDER_STAGES` in mobile app.

---

### CRIT-06: Public Unauthenticated Payment Bypass via Header Spoofing
* **Repositories:** `masova-platform` (`commerce-service`, `api-gateway`, root `docker-compose.yml`)
* **Citations:** `commerce-service/.../SecurityConfig.java:L51`, `OrderController.java:L383-394`, `docker-compose.yml:L119`
* **Impact:** LAN attackers hitting exposed port `8084` can forge `X-Internal-Service: payment-service` and mark orders `PAID` without authentication.
* **Remediation:** Bind ports to `127.0.0.1` or docker network only; require signed internal HMAC tokens for inter-service communication.

---

### CRIT-07: Circuit Breaker Fallback Swallows Payment State Updates
* **Repositories:** `masova-platform` (`payment-service`)
* **Citations:** `payment-service/.../OrderServiceClient.java:L114-120`
* **Impact:** Customers are charged, but orders remain `PENDING` indefinitely if `commerce-service` is slow.
* **Remediation:** Implement transactional outbox or durable retry queue for failed inter-service payment synchronization.

---

### CRIT-08: TOCTOU Concurrency Race Condition on Refunds
* **Repositories:** `masova-platform` (`payment-service`)
* **Citations:** `payment-service/.../RefundService.java:L169-181`
* **Impact:** Simultaneous refund requests pass balance checks concurrently, resulting in double refunds to customers.
* **Remediation:** Implement distributed locking via Redis (Redisson) or database row locks on `Transaction` during refund execution.

---

### CRIT-09: GDPR Article 17 Erasure Violation
* **Repositories:** `masova-platform` (`commerce-service`)
* **Citations:** `commerce-service/.../OrderService.java:L1405-1418`
* **Impact:** Anonymization cleans MongoDB but leaves full plaintext PII in PostgreSQL, violating European data protection law.
* **Remediation:** Add PostgreSQL update query in `anonymizeCustomerOrders()` to overwrite PII in `OrderJpaEntity`.

