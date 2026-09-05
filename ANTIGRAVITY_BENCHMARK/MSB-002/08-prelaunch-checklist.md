# 08 — Pre-Launch Operational Remediation Checklist

**Benchmark:** MSB-002: European Single-Restaurant Operational Readiness
**Document Identifier:** Pre-Launch Remediation & Deployment Action Plan
**Target System:** MaSoVa Complete Multi-Service Ecosystem
**Auditor Perspective:** Independent Technical Due-Diligence Engineer for European Single-Restaurant Owner/Operator
**Current Readiness Status:** **FAIL — DEPLOYMENT FORBIDDEN**
**Remediation Goal:** Roadmap to transition the restaurant platform from RED (Forbidden) to GREEN (Operational)

---

## 1. Executive Action Framework

This checklist defines the non-negotiable remediation pathway required before any real European restaurant can open its doors on the MaSoVa platform. The checklist is divided into three sequential tiers:

* **Tier 1: Mandatory P0 Code Fixes (Engineering Blockers):** Defects in source code that directly cause customer lockouts, stuck food orders, silent payment drops, unhandled refund races, or immediate statutory violations. Must be patched and unit-tested in Git.
* **Tier 2: Architectural & Infrastructure Hardening (Stability & Integrity):** Distributed systems enhancements (transactional outbox, database synchronisation locks, network perimeter isolation, dead-letter retries) necessary to prevent financial data corruption and silent divergence.
* **Tier 3: Operational, Legal & Compliance Controls (Business Governance):** Organizational, fiscal, and regulatory certifications (TSE hardware, GDPR DPA, Works Council agreements, HACCP allergen print integration) required to operate legally under European Union law.

---

## 2. Tier 1: Mandatory P0 Code Fixes (Engineering Blockers)

Every item in this tier represents a confirmed operational defect in the existing codebase that must be repaired before deployment.

```
+----+---------------------------------------+-----------------------------+-------------------+----------+
| #  | Defect Title                          | Primary Code Citation       | Severity / Risk   | Est. Fix |
+----+---------------------------------------+-----------------------------+-------------------+----------+
| 01 | Driver App 404/405 Contract Disconnect| MaSoVaCrewApp orderApi.ts   | CATASTROPHIC      | 4 Hours  |
| 02 | Customer App 403 on Order Cancellation| masova-mobile orderApi.ts   | CRITICAL          | 2 Hours  |
| 03 | Tracking UI En-Route Progress Freeze  | OrderTrackingScreen.tsx     | HIGH              | 3 Hours  |
| 04 | Delivery Silent Completion Black Hole | OrderService.java:L1379     | CRITICAL          | 4 Hours  |
| 05 | Circuit Breaker Swallows Payment State| OrderServiceClient.java:L114| CATASTROPHIC      | 6 Hours  |
| 06 | Unsynchronized Refund Race Double-Drain| RefundService.java:L169     | CATASTROPHIC      | 4 Hours  |
| 07 | GDPR Art. 17 PostgreSQL PII Leak      | OrderService.java:L1405     | REGULATORY CRIT   | 4 Hours  |
| 08 | Gross/Net VAT Inversion & Fallback    | EuVatEngine.java:L45        | FINANCIAL CRIT    | 6 Hours  |
| 09 | Perimeter Bypass via Internal Header  | OrderController.java:L383   | SECURITY CRIT     | 3 Hours  |
| 10 | Missing 14 EU Allergens in Menu Schema| MenuItem.java:L45           | HEALTH / LEGAL    | 8 Hours  |
+----+---------------------------------------+-----------------------------+-------------------+----------+
```

---

### Item 01: Driver App Broken API Contract & Method Mismatch
* **Component:** `MaSoVaCrewApp` (Driver Mobile Frontend)
* **File & Lines:** `MaSoVaCrewApp/src/store/api/orderApi.ts:L83, L88`
* **Defect Description:**
  - Line 83 calls `GET /orders/status/{status}`. The backend (`commerce-service/.../OrderController.java:L143-147`) deprecated this path in favor of query parameters (`GET /api/orders?status={status}`), resulting in an immediate **HTTP 404 Not Found**.
  - Line 88 calls `PATCH /orders/{orderId}/status`. The backend (`OrderController.java:L205`) only accepts `POST /orders/{orderId}/status`, resulting in an immediate **HTTP 405 Method Not Allowed**.
* **Operational Consequence:** Delivery drivers cannot view available delivery tasks and cannot accept or advance deliveries from their mobile devices.
* **Required Code Change:**
  ```typescript
  // In MaSoVaCrewApp/src/store/api/orderApi.ts
  // Replace Line 83:
  // query: (status) => `/orders/status/${status}`
  query: (status) => `/orders?status=${status}&storeId=${getStoreId()}`

  // Replace Line 88:
  // url: `/orders/${orderId}/status`, method: 'PATCH', body: { status }
  url: `/orders/${orderId}/status`, method: 'POST', body: { status }
  ```
* **Validation Test:** Execute end-to-end driver login, query available orders with status `BAKED`, and transition order to `DISPATCHED`. Confirm HTTP 200 OK. `[VERIFIED FROM SOURCE]`

---

### Item 02: Customer Mobile Cancellation 403 Forbidden
* **Component:** `masova-mobile` (Customer Frontend) & `commerce-service`
* **File & Lines:** `masova-mobile/src/services/api/orderApi.ts:L59` and `commerce-service/.../OrderController.java:L308`
* **Defect Description:**
  - Mobile client dispatches `DELETE /api/orders/{orderId}`.
  - Backend controller secures this endpoint with `@PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")`.
* **Operational Consequence:** Customers attempting to cancel a pending order immediately receive an unhandled **HTTP 403 Forbidden**, leaving them unable to cancel an erroneous order before kitchen preparation begins.
* **Required Code Change:**
  - Update `OrderController.java:L308` to include `'CUSTOMER'`:
    ```java
    @DeleteMapping("/{orderId}")
    @PreAuthorize("hasAnyRole('CUSTOMER', 'MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
    public ResponseEntity<Order> cancelOrder(@PathVariable String orderId, HttpServletRequest request) {
        String userType = StoreContextUtil.getUserTypeFromHeaders(request);
        if ("CUSTOMER".equalsIgnoreCase(userType)) {
            orderService.assertCustomerOwnsOrder(orderId, StoreContextUtil.getUserIdFromHeaders(request));
        }
        return ResponseEntity.ok(orderService.cancelOrder(orderId, "Customer initiated cancellation"));
    }
    ```
* **Validation Test:** Send cancellation request from an authenticated customer account on an order in `PENDING` status. Verify order transitions to `CANCELLED` with HTTP 200 OK. `[VERIFIED FROM SOURCE]`

---

### Item 03: Customer App Order Tracking Screen En-Route Freeze
* **Component:** `masova-mobile` (Customer Frontend)
* **File & Lines:** `masova-mobile/src/screens/order/OrderTrackingScreen.tsx:L36, L160`
* **Defect Description:**
  - The status progression array `STATUS_STEPS` includes `DISPATCHED` but completely omits `OUT_FOR_DELIVERY`.
  - When the logistics service updates the order status to `OUT_FOR_DELIVERY`, `STATUS_STEPS.indexOf("OUT_FOR_DELIVERY")` evaluates to `-1`.
* **Operational Consequence:** The order tracking screen resets the delivery progress bar to 0%, fails to render the delivery driver map, and hides the critical Delivery Confirmation OTP card.
* **Required Code Change:**
  - Add `OUT_FOR_DELIVERY` as an alias or explicit step alongside `DISPATCHED` in `STATUS_STEPS` and map it to step 4 in `currentStepIndex`.
* **Validation Test:** Simulate WebSocket push of `OUT_FOR_DELIVERY` status payload. Verify mobile UI renders active courier card and shows the 6-digit OTP code. `[VERIFIED FROM SOURCE]`

---

### Item 04: Delivery Silent Completion Black Hole
* **Component:** `commerce-service`
* **File & Lines:** `commerce-service/.../OrderService.java:L1379-1399` (`markOrderDelivered`)
* **Defect Description:**
  - Method updates the status to `DELIVERED` in MongoDB and PostgreSQL, but completely omits:
    1. Publishing `OrderDeliveredEvent` to RabbitMQ.
    2. Invoking customer loyalty reward calculations.
    3. Invoking `fiscalSigningService.signOrder()` for compliance closing.
* **Operational Consequence:** Deliveries vanish silently from audit logs, customers do not receive loyalty rewards, and the fiscal journal does not record a tamper-evident delivery closing record.
* **Required Code Change:**
  - Inject `RabbitTemplate` and `FiscalSigningService` into `markOrderDelivered`, publish `order.delivered` message to exchange `masova.events`, and trigger fiscal signing.
* **Validation Test:** Transition an order to `DELIVERED` via driver OTP. Verify event received in `logistics-service` and fiscal signature string generated in database. `[VERIFIED FROM SOURCE]`

---

### Item 05: Payment Circuit Breaker Swallows Failure
* **Component:** `payment-service`
* **File & Lines:** `payment-service/.../client/OrderServiceClient.java:L114-120`
* **Defect Description:**
  - Feign fallback `updateOrderPaymentStatusFallback` logs a single warning message and returns without throwing an exception or enqueuing a retry.
* **Operational Consequence:** When `commerce-service` experiences a momentary latency spike, the Stripe webhook returns HTTP 200 OK to Stripe. The customer is charged, but the restaurant kitchen never receives or prepares the order.
* **Required Code Change:**
  - Remove silent swallow. Persist failed payment notification events to a PostgreSQL `payment_outbox` table and throw `RetryablePaymentException` so RabbitMQ or Spring Retry handles the failure.
* **Validation Test:** Kill `commerce-service` Docker container, dispatch mock Stripe payment success webhook, confirm record written to outbox and reprocessed upon container restart. `[VERIFIED FROM SOURCE]`

---

### Item 06: Concurrent Refund Double-Drain Race Condition
* **Component:** `payment-service`
* **File & Lines:** `payment-service/.../service/RefundService.java:L169-183`
* **Defect Description:**
  - Calculates cumulative refund amount in-memory (`currentTotalRefunded`) without a database row-level lock or distributed Redis mutex before issuing the refund request to Stripe.
* **Operational Consequence:** Two rapid refund clicks from cashier and manager can drain double the order total from the restaurant's merchant account.
* **Required Code Change:**
  - Wrap refund execution in a pessimistic row lock (`SELECT * FROM payments WHERE id = :id FOR UPDATE`) or an atomic Redis distributed lock (`redissonClient.getLock("lock:refund:" + paymentId)`).
* **Validation Test:** Fire 5 concurrent HTTP POST requests to `/api/payments/refund` with identical payment ID. Confirm exactly one succeeds and four are rejected with HTTP 409 Conflict. `[VERIFIED FROM SOURCE]`

---

### Item 07: GDPR Article 17 Dual-Store PII Anonymization Leak
* **Component:** `commerce-service`
* **File & Lines:** `commerce-service/.../OrderService.java:L1405-1418` (`anonymizeCustomerOrders`)
* **Defect Description:**
  - Executes MongoDB update `mongoTemplate.updateMulti(query, update, OrderDocument.class)`.
  - Omits updating PostgreSQL `commerce_schema.orders`.
* **Operational Consequence:** Customer name, phone number, email, and physical home address persist indefinitely in PostgreSQL in plain text after an Article 17 erasure request.
* **Required Code Change:**
  - Add native JPA update query:
    ```java
    orderRepository.anonymizeOrdersByCustomerId(customerId, "[ANONYMIZED]", "[ANONYMIZED]");
    ```
* **Validation Test:** Invoke `POST /api/gdpr/erasure` for test customer. Query PostgreSQL table `commerce_schema.orders` and assert zero rows contain the customer's original name or phone. `[VERIFIED FROM SOURCE]`

---

### Item 08: Inverted EU VAT Calculation & India Fallback
* **Component:** `commerce-service`
* **File & Lines:** `commerce-service/.../EuVatEngine.java:L45-50` and `OrderService.java:L198-204`
* **Defect Description:**
  - `EuVatEngine` computes VAT by treating menu prices as net and adding VAT on top (`total = subtotal + vat`), violating EU Price Indication Directive (prices must be gross).
  - Delivery fees are excluded from VAT calculation.
  - If `storeServiceClient.getStore()` fails, system falls back to hardcoded Indian CGST/SGST (18%).
* **Operational Consequence:** Customer is overcharged at checkout relative to shelf prices; delivery VAT is under-reported; tax audit results in severe penalties.
* **Required Code Change:**
  - Refactor `EuVatEngine.java` to perform gross-to-net extraction:
    $$\text{Net} = \frac{\text{Gross}}{1 + \text{VAT Rate}}, \quad \text{Tax} = \text{Gross} - \text{Net}$$
  - Apply applicable standard VAT rate to delivery fees.
  - Throw `IllegalStateException` rather than falling back to India GST if store metadata is unreachable.
* **Validation Test:** Create order with €10.00 food item (at 7% VAT) and €3.00 delivery (at 19% VAT). Confirm checkout total is exactly €13.00, with €0.65 food VAT and €0.48 delivery VAT itemized on receipt. `[VERIFIED FROM SOURCE]`

---

### Item 09: Microservice Perimeter Bypass via `X-Internal-Service`
* **Component:** `commerce-service` & `docker-compose.yml`
* **File & Lines:** `commerce-service/.../OrderController.java:L383-395` and `docker-compose.yml:L119`
* **Defect Description:**
  - Port 8084 is exposed directly to the LAN (`8084:8084`).
  - `OrderController.java:L383` allows any request presenting an arbitrary `X-Internal-Service` header to bypass authentication checks.
* **Operational Consequence:** Any device on the restaurant Wi-Fi can mark arbitrary orders as PAID or CANCELLED without credentials.
* **Required Code Change:**
  - Remove external port mapping from `docker-compose.yml` (remove `8084:8084`, keep on Docker bridge network only).
  - Replace plain string `X-Internal-Service` header check with shared HMAC-SHA256 secret token or mutual TLS (mTLS).
* **Validation Test:** Attempt to send `POST http://192.168.50.88:8084/api/orders/{id}/payment` from an external device. Confirm connection refused. `[VERIFIED FROM SOURCE]`

---

### Item 10: Missing Mandatory 14 EU Allergens Data Structure
* **Component:** `commerce-service`
* **File & Lines:** `commerce-service/.../MenuItem.java:L45`
* **Defect Description:**
  - Schema stores a generic `allergens: List<String>` without validation or enforcement of EU Regulation 1169/2011 Annex II mandatory allergens.
* **Operational Consequence:** Menu items can be published with blank or unstandardized allergen fields, creating fatal anaphylactic risks for customers and immediate closure liability.
* **Required Code Change:**
  - Introduce strict Java enum `EuAllergen` containing the 14 mandatory EU allergens (Gluten, Crustaceans, Eggs, Fish, Peanuts, Soybeans, Milk, Nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs).
  - Add bean validation preventing publication of menu items without an explicit allergen declaration.
* **Validation Test:** Attempt to create a menu item via `POST /api/menu` without declaring allergens. Assert API returns HTTP 400 Bad Request with validation error. `[VERIFIED FROM SOURCE]`

---

## 3. Tier 2: Architectural & Infrastructure Hardening

```
+----+---------------------------------------+-----------------------------+-------------------+----------+
| #  | Remediation Task                      | Affected Subsystem          | Architectural Goal| Target   |
+----+---------------------------------------+-----------------------------+-------------------+----------+
| 11 | Transactional Outbox Implementation   | commerce, payment, logistics| Event Reliability | 3 Days   |
| 12 | Dual-Write Database Reconciliation    | commerce-service            | Data Integrity    | 2 Days   |
| 13 | Redis Fail-Closed Security Policy     | api-gateway SecurityConfig  | Token Blacklist   | 1 Day    |
| 14 | Sequential Fiscal Receipt Numbering   | commerce-service            | Anti-Fraud / Tax  | 2 Days   |
| 15 | Physical POS Hardware Driver Layer    | Staff Web / Mobile App      | ESC/POS & Terminal| 4 Days   |
+----+---------------------------------------+-----------------------------+-------------------+----------+
```

### Action 11: Transactional Outbox Pattern for Distributed Events
* **Problem:** `commerce-service` commits order updates to PostgreSQL and then makes an asynchronous network call to publish to RabbitMQ (`rabbitTemplate.convertAndSend()`). If RabbitMQ is down, the message is dropped forever, leaving logistics and payment out of sync.
* **Remediation:** Write outgoing domain events to an `outbox_events` table within the same database transaction as the order mutation. A dedicated background poller (Debezium CDC or Spring `@Scheduled` worker) reads the outbox and publishes to RabbitMQ with guaranteed at-least-once delivery. `[STRONGLY INFERRED]`

### Action 12: Dual-Write Database Reconciliation & Failover
* **Problem:** In `OrderService.java`, order mutations are committed to MongoDB, followed by an asynchronous or secondary write to PostgreSQL. If PostgreSQL fails, the error is swallowed and logged, causing silent state divergence between operational queries and financial reporting.
* **Remediation:** Designate PostgreSQL as the single source of truth (SSOT) for all financial and transactional data. Remove direct dual-writing from controllers; populate MongoDB read-models asynchronously via database CDC or idempotent event subscribers. `[VERIFIED FROM SOURCE]`

### Action 13: Redis Token Blacklist Fail-Closed Configuration
* **Problem:** `api-gateway` checks revoked JWT tokens against Redis. If Redis is unavailable, the fallback catch block permits the request to pass through, allowing revoked staff credentials to remain active.
* **Remediation:** Modify gateway filter to return **HTTP 503 Service Unavailable** when the revocation store cannot be verified for privileged roles (`MANAGER`, `CASHIER`, `ADMIN`). `[VERIFIED FROM SOURCE]`

### Action 14: Sequential Gapless Receipt Counter
* **Problem:** `OrderService.java:L190` generates order numbers using `System.currentTimeMillis() + UUID.randomUUID().substring(0, 4)`. EU fiscal laws require strict sequential numbering with zero gaps.
* **Remediation:** Implement a PostgreSQL atomic sequence table (`receipt_sequences`) per store and fiscal year, locked via `SELECT nextval('store_receipt_seq')` during receipt finalization. `[VERIFIED FROM SOURCE]`

### Action 15: Physical Hardware Integration Layer
* **Problem:** The platform has zero physical hardware integration drivers. It cannot communicate with USB/Ethernet receipt printers (ESC/POS) or EMV payment terminals (ZVT / OPI protocols).
* **Remediation:** Deploy a local hardware bridge service (Go or Node.js daemon running on local POS terminal) that exposes a WebSocket interface to the staff web frontend and dispatches ESC/POS print jobs and terminal payment triggers. `[VERIFIED FROM SOURCE]`

---

## 4. Tier 3: Operational, Legal & Compliance Controls

```
+----+---------------------------------------+-----------------------------+-------------------+----------+
| #  | Governance / Compliance Action        | Governing Jurisdiction      | Legal Requirement | Status   |
+----+---------------------------------------+-----------------------------+-------------------+----------+
| 16 | Certified Cloud/Hardware TSE Setup    | Germany (KassenSichV)       | Fiscal Security   | BLOCKING |
| 17 | Works Council Labor Agreement         | Germany BetrVG / France CSE | Employee Profiling| BLOCKING |
| 18 | GDPR Data Processing Addenda (DPAs)   | EU GDPR Art. 28             | Third-Party Vendor| MANDATORY|
| 19 | EU AI Act Article 50 Disclosures      | EU AI Act 2024/1689         | Chatbot Notice    | MANDATORY|
| 20 | HACCP Allergen Kitchen Print Tickets  | EU Regulation 1169/2011     | Food Safety       | BLOCKING |
+----+---------------------------------------+-----------------------------+-------------------+----------+
```

### Action 16: Certified Fiscal TSE Device Integration
* **Legal Obligation:** German *KassenSichV* and French *NF525* require all digital cash registers to record transactions using a certified Technical Security System (TSE).
* **Current State:** Hardcoded mock strings (`GermanyTseFiscalSigner.java:L27-32` returns `"STUB-TSE-SIG-" + orderId`).
* **Operator Action:** Contract with an accredited cloud-TSE provider (e.g., Fiskaly or Swissbit) and replace the stub implementation with authenticated REST API calls to the certified TSE environment before issuing a single receipt. `[VERIFIED FROM SOURCE]`

### Action 17: Works Council Co-Determination Agreement
* **Legal Obligation:** Under German *Betriebsverfassungsgesetz* (§ 87 Abs. 1 Nr. 6) and French Labor Code, employee monitoring and automated scheduling algorithms require formal approval from employee representatives.
* **Operator Action:** Suspend `kitchen_coach_agent` and `getStaffLeaderboard` until a formal *Betriebsvereinbarung* (Works Agreement) is negotiated and executed with staff representatives. `[REQUIRES LEGAL/TAX REVIEW]`

### Action 18: GDPR Vendor DPAs & EU Data Residency Lock
* **Legal Obligation:** GDPR Article 28 requires binding Data Processing Agreements with all sub-processors.
* **Operator Action:**
  - Execute DPAs with MongoDB Atlas, Redis Cloud, Stripe Europe Ltd, and Google Cloud.
  - Migrate all Google Gemini LLM API calls in `masova-support` to European regional endpoints (`europe-west3`, Frankfurt) to prevent illegal third-country data transfers under GDPR Chapter V. `[REQUIRES LEGAL/TAX REVIEW]`

### Action 19: Mandatory AI Interaction Disclosures
* **Legal Obligation:** Article 50(1) of the EU AI Act requires natural persons to be informed when they are interacting with an AI system.
* **Operator Action:** Update the customer mobile app and web chat interfaces to display an unmistakable notification: *"You are conversing with an automated AI support assistant. Requests for refunds or cancellations are reviewed by human staff."* `[VERIFIED FROM SOURCE]`

### Action 20: HACCP Allergen Display on Kitchen Prep Tickets
* **Legal Obligation:** EU Regulation 1169/2011 mandates clear disclosure of the 14 major food allergens at the point of ordering and preparation.
* **Operator Action:** Update kitchen display system (KDS) and kitchen print templates to prominently highlight declared allergens in high-contrast red banners on all kitchen tickets. `[VERIFIED FROM SOURCE]`

---

## 5. Pre-Launch Gate Sign-Off Matrix

Before the restaurant can legally and operationally launch, the owner and technical lead must formally sign off on each milestone:

```
[ ] Milestone 1: All 10 Tier 1 P0 Code Fixes committed, peer-reviewed, and unit-tested.
[ ] Milestone 2: Driver crew mobile app verified to accept and complete deliveries against staging backend.
[ ] Milestone 3: Gross VAT calculation verified against official fiscal test vectors.
[ ] Milestone 4: Certified TSE fiscal signer verified with tax authorities.
[ ] Milestone 5: GDPR dual-store anonymization validated in staging database.
[ ] Milestone 6: High-risk workplace AI agents disabled pending Works Council agreement.
[ ] Milestone 7: Physical ESC/POS receipt printer and payment terminal operational on LAN.
```

**Final Sign-Off:**
**Lead Due-Diligence Engineer:** ___________________________
**Restaurant Owner / Managing Director:** ___________________________
**Date:** ___________________________

