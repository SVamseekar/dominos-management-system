# 04 — Test 4: GDPR Customer Data Trace & Privacy Audit

**Benchmark:** MSB-002
**Title:** European Single-Restaurant Operational Readiness
**Perspective:** Technical Due Diligence on GDPR Compliance for an EU Restaurant
**Standard of Evidence:** Strict source-code citations (`Repository`, `File`, `Symbol`, `Line`)
**Status Tags:** `[VERIFIED FROM SOURCE]`, `[STRONGLY INFERRED]`, `[REQUIRES RUNTIME VALIDATION]`, `[REQUIRES LEGAL/TAX REVIEW]`

---

## 1. Trace of One Customer's Personal Data

Assume an EU resident (e.g., *Claire Dubois*, Paris, France, email: `claire.dubois@example.fr`, phone: `+33 6 12 34 56 78`, address: `14 Rue de Rivoli, 75004 Paris`) registers an account, places an order, chats with support, and later requests data erasure under GDPR Article 17.

```
Personal Data Lifecycle in MaSoVa:
[Customer Registration] ─────────► core-service (MongoDB + PostgreSQL User Entity)
          │
[Order Placed] ──────────────────► commerce-service (MongoDB Orders + PG Orders + RabbitMQ Events)
          │
[Payment via Stripe] ────────────► payment-service (MongoDB Transactions - AES-256 PII)
          │
[Delivery Dispatch] ─────────────► logistics-service (MongoDB DeliveryTracking + Driver Location)
          │
[Support Chat] ──────────────────► masova-support (Redis Sessions + Google Gemini API / USA)
          │
[Analytics Aggregation] ─────────► intelligence-service (MongoDB Sales Aggregates)
```

---

## 2. Personal Data Storage & Flow Inventory

| Data Field              | Primary Storage System                       | Secondary / Dual Storage                       | Transit / Messaging             | AI / External Subprocessors      |
| :---------------------- | :------------------------------------------- | :--------------------------------------------- | :------------------------------ | :------------------------------- |
| **Customer Name**       | `core-service` MongoDB `users`               | `commerce-service` PG `orders`, `users`        | RabbitMQ `order.created`        | Google GenAI (US), Stripe        |
| **Email Address**       | `core-service` MongoDB `users`               | `commerce-service` PG `orders`, Mongo `orders` | RabbitMQ `order.created`        | Google GenAI (US), Stripe        |
| **Phone Number**        | `core-service` MongoDB `users`               | `commerce-service` PG `orders`, Mongo `orders` | RabbitMQ `order.created`        | Google GenAI (US), Stripe        |
| **Delivery Address**    | `core-service` MongoDB `customers`           | `commerce-service` Mongo `orders`, `logistics` | RabbitMQ `order.created`        | Google Maps API                  |
| **Order History**       | `commerce-service` Mongo `orders`            | `commerce-service` PG `orders`                 | RabbitMQ `order.status.changed` | Google GenAI (via support agent) |
| **Payment Details**     | `payment-service` Mongo `transactions`       | Stripe Vault (Tokenized)                       | RabbitMQ `payment.completed`    | Stripe Inc. (US/EU)              |
| **Support Transcripts** | `masova-support` Redis (`turn_history`)      | `masova-support` SQLite / in-memory            | REST payloads                   | Google Gemini API (US)           |
| **Loyalty Balance**     | `core-service` MongoDB `customers`           | None                                           | Event payloads                  | None                             |
| **GPS / Location**      | `logistics-service` Mongo `driver_locations` | Redis live tracking cache                      | WebSocket `/topic/tracking`     | Google Maps API                  |

---

## 3. The 8 Critical GDPR Compliance Inquiries

### 1. Where is personal data stored?
* **Core Service:**
  * MongoDB `users` collection (`core-service/.../User.java:L35-65`): name, email, phone, hashed password, address.
  * MongoDB `customers` collection (`core-service/.../Customer.java:L30-85`): delivery addresses, allergen preferences, loyalty points.
  * PostgreSQL `core_schema.users` table (`UserJpaEntity.java`): username, email, role.
* **Commerce Service:**
  * MongoDB `orders` collection (`commerce-service/.../Order.java:L38-42`): `customerId`, `customerName`, `customerPhone`, `customerEmail`, `deliveryAddress`.
  * PostgreSQL `commerce_schema.orders` table (`OrderJpaEntity.java:L58-69`): `customer_name`, `customer_phone`, `customer_email`.
* **Payment Service:**
  * MongoDB `transactions` collection (`payment-service/.../Transaction.java:L45-65`): `customerId`, `customerEmail` (AES-256 encrypted), `customerPhone` (AES-256 encrypted), `receipt`.
* **Logistics Service:**
  * MongoDB `delivery_tracking` collection: customer delivery address, contact phone, delivery coordinates, OTP code.
* **AI Support Agent:**
  * Redis database 1 (`masova-support/src/masova_agent/agent.py:L33-35`): chat turn history containing order numbers, dispute reasons, and customer complaints.

---

### 2. Where is it duplicated?
Personal data is duplicated across **five distinct datastores**:
1. Customer identity (Name, Phone, Email) is copied from `core-service` into every single order document in `commerce-service` MongoDB (`Order.java:L38-42`).
2. Customer identity is simultaneously copied into `commerce-service` PostgreSQL `OrderJpaEntity.java:L61-68`.
3. Customer email and phone are duplicated in `payment-service` MongoDB `Transaction.java:L55-58`.
4. Delivery street address is duplicated in `core-service` (Customer profile), `commerce-service` (Order document), and `logistics-service` (Delivery tracking).
5. Customer order context is duplicated in Redis support conversation memory (`RedisSessionService.py`).

---

### 3. Can the customer request deletion (Article 17 Right to Erasure)?
`[VERIFIED FROM SOURCE]`
Yes. An erasure workflow is explicitly provided:
* Endpoint: `POST /api/gdpr/requests` with `requestType: ERASURE`.
* Service: `core-service/src/main/java/com/MaSoVa/core/user/service/GdprDataRequestService.java:L123-146, L408-467`.
* Method: `anonymizeAllCustomerData(userId, authToken)`.
* This service initiates cross-service calls to `orderServiceClient.anonymizeCustomerData()`, `paymentServiceClient.anonymizeCustomerData()`, and `deliveryServiceClient.anonymizeCustomerData()`.

---

### 4. Does deletion reach every storage system?
* **Status:** ❌ **FAIL (Critical Article 17 Violation)** `[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
* **Findings:**
  1. **PostgreSQL Orders Retain Plaintext PII:**
     In `commerce-service/.../OrderService.java:L1405-1418`:
     ```java
     @Transactional
     public void anonymizeCustomerOrders(String customerId) {
         List<Order> orders = orderRepository.findByCustomerId(customerId);
         for (Order order : orders) {
             order.setCustomerName("ANONYMIZED");
             order.setCustomerPhone("ANONYMIZED");
             order.setCustomerEmail("ANONYMIZED");
             if (order.getDeliveryAddress() != null) {
                 order.setDeliveryAddress(null);
             }
             orderRepository.save(order);
         }
     }
     ```
     `OrderService.anonymizeCustomerOrders` updates **MongoDB only**! It never calls `orderJpaRepository` or updates `OrderJpaEntity`. The PostgreSQL table `commerce_schema.orders` retains the customer's full name, phone number, and email address indefinitely.
  2. **PostgreSQL User Entity Retains Identity:**
     In `core-service/.../GdprDataRequestService.java:L469-490`, `anonymizeUserData(userId)` updates `userRepository` (MongoDB). `UserJpaRepository` is not even injected into the service.
  3. **Redis AI Chat Transcripts are Not Purged:**
     The erasure workflow contains no hook to purge conversation turns stored in Redis key `masova_support:turns:{user_id}`.
  4. **Log Backlogs:**
     Application log files (`logs/commerce.log`, `logs/core.log`) log unmasked customer names and emails during order creation (`OrderController.java:L112`), persisting PII in rotation archives without redaction.

---

### 5. What data must potentially be retained for legal/accounting reasons?
`[REQUIRES LEGAL/TAX REVIEW]`
Under European tax and commercial codes, a restaurant business is legally required to retain transaction records:
* **Germany (§147 AO, §257 HGB):** 10-year retention for books, records, invoices, and accounting vouchers.
* **France (Article L123-22 Code de commerce):** 10-year retention for commercial invoices and accounting documents.
* **Italy (Art. 2220 Codice Civile):** 10-year retention for invoices and receipts.
* **Netherlands (Art. 52 AWR):** 7-year retention for basic financial records.

Data that **MUST** be retained includes: transaction timestamp, order total, net amount, VAT rates, VAT amounts, payment transaction IDs, and fiscal signatures.

---

### 6. Is deletion distinguishable from legitimate retention?
* **Status:** ❌ **FAIL (All-or-Nothing / Flawed Erasure Architecture)** `[VERIFIED FROM SOURCE]`
* **Findings:**
  * GDPR Article 17(3)(b) explicitly provides that the right to erasure does not apply to the extent that processing is necessary for compliance with a legal obligation under Union or Member State law.
  * In `OrderService.java:L1405-1418`, MaSoVa overwrites names and emails with `"ANONYMIZED"`, which in principle preserves the financial order totals (`subtotal`, `tax`, `total`).
  * **However:**
    1. Setting `order.setDeliveryAddress(null)` permanently destroys geographical delivery tax nexus proof.
    2. Because PostgreSQL is untouched while MongoDB is anonymized, the system maintains two conflicting records for the same invoice: one anonymized, one containing plaintext PII.
    3. There is no cryptographic archiving partition or immutable retention flag isolating historical tax records from active operational databases.

---

### 7. Are subprocessors and international transfers visible from the implementation?
`[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
Yes. Inspection of dependencies, configuration, and source code reveals several external subprocessors:
1. **Google LLC (United States):**
   * Service: `masova-support/src/masova_agent/agent.py:L8,L38-45` uses Google GenAI SDK (`google-genai` / `gemini-2.5-flash`).
   * Data Transferred: Customer chat inputs, order numbers, complaint descriptions, dispute notes.
   * Transfer Mechanism: Sent to Google API endpoints in the US. No EU data residency configuration is present in code or configuration.
2. **Stripe Inc. (United States / Ireland):**
   * Service: `payment-service/.../StripeGateway.java`.
   * Data Transferred: Customer email, customer phone, transaction amounts, IP addresses.
3. **Twilio / SMS Gateway:**
   * Service: `core-service/.../NotificationService.java`.
   * Data Transferred: Customer phone numbers and order status text.

**Legal Requirement:** Under GDPR Chapter V (Articles 44–49) and the *Schrems II* ruling, transferring customer PII to US-based AI and cloud providers requires verified Standard Contractual Clauses (SCCs) or participation in the EU-U.S. Data Privacy Framework.

---

### 8. What requires legal/privacy review rather than code-only conclusions?
The following issues cannot be resolved by code inspection alone and require formal review by an EU Data Protection Officer (DPO) and tax advisor:
1. **DPA & SCC Execution:** Whether the restaurant owner has executed valid Data Processing Agreements (GDPR Art. 28) with Google Cloud, Stripe, and Twilio.
2. **Privacy Policy (Art. 13/14):** Whether customer-facing privacy notices accurately disclose that customer inquiries and complaint texts are processed by Google AI (Gemini).
3. **Balancing Test for Financial Retention:** Whether retaining non-anonymized PostgreSQL orders is legally justifiable under national tax retention statutes as a defense against Article 17 erasure requests.
4. **Employee Surveillance (Kitchen Coach):** Whether tracking individual kitchen prep times (`kitchen_coach_agent.py`) constitutes employee monitoring requiring consultation with local Works Councils (*Betriebsrat* in Germany, *Comité Social et Économique* in France).

---

## 4. GDPR Readiness Scorecard

| Requirement                            |  Evaluation  | Finding                                                               |
| :------------------------------------- | :----------: | :-------------------------------------------------------------------- |
| **Art. 5(1)(c) Data Minimisation**     | ⚠️ BORDERLINE | Contact PII duplicated across 5 stores and entities.                  |
| **Art. 15 Right of Access**            | ✅ COMPLIANT  | `exportAllCustomerData()` exports JSON package across services.       |
| **Art. 17 Right to Erasure**           | ❌ VIOLATION  | PostgreSQL retains plaintext names, emails, and phones after erasure. |
| **Art. 20 Data Portability**           | ✅ COMPLIANT  | Portable JSON export implemented in `GdprDataRequestService.java`.    |
| **Art. 32 Security of Processing**     | ⚠️ DEFECTIVE  | Internal service ports open to LAN without mTLS or header signatures. |
| **Art. 44-49 International Transfers** |    ⚠️ RISK    | Support chat sent to Google Gemini in USA without residency lock.     |

**Final GDPR Conclusion:** The platform cannot be operated in compliance with GDPR. The failure of customer erasure to clean PostgreSQL represents an active regulatory liability exposing the restaurant owner to fines under GDPR Article 83(5) (up to €20 million or 4% of total worldwide annual turnover).

