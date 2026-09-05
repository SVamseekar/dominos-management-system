# Document 05 — GDPR Operational & Legal Compliance Readiness Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** MaSoVa Restaurant Management System (Full Microservices Ecosystem)
**Evaluator:** Independent Go-Live Board (Production Engineering, Cybersecurity, GDPR / Compliance)
**Date:** September 2026
**Status:** **REJECTED (CRITICAL NON-COMPLIANCE)**

---

## 1. Executive Summary & Regulatory Classification

Under Regulation (EU) 2016/679 (General Data Protection Regulation - GDPR), operating an enterprise restaurant management platform across European member states subjects the operator to strict statutory requirements. The platform acts as both a **Data Controller** (for staff, rider telemetry, and direct platform customers) and a **Data Processor** (for tenant restaurants processing diner orders and payment details).

The Board evaluated the codebase against the binding articles of GDPR using the following standardized audit tags:
- `[VERIFIED FROM SOURCE]`: Code or configuration implements the requirement as inspected.
- `[TECHNICALLY DEFICIENT]`: Code attempts to implement the requirement, but the implementation contains structural defects, race conditions, or unhandled failure modes.
- `[EVIDENCE MISSING]`: No code, automation, documentation, or operational configuration exists in the ecosystem.
- `[LEGAL REVIEW REQUIRED]`: Architectural behavior creates severe regulatory liability requiring statutory counsel and supervisory authority engagement.

```
+----------------------------------------------------------------------------------------------------+
|                                    GDPR COMPLIANCE SCORECARD                                       |
+------------------------------+---------------------------+-----------------------------------------+
| Article / Mandate            | Status Classification     | Primary Code Reference / Root Cause     |
+------------------------------+---------------------------+-----------------------------------------+
| Art. 5 (Core Principles)     | [TECHNICALLY DEFICIENT]   | Unlimited retention, cleartext DB logs  |
| Art. 12 (Transparency/Modal) | [VERIFIED FROM SOURCE]    | CookieConsent.tsx UI implemented        |
| Art. 15 (Right of Access)    | [TECHNICALLY DEFICIENT]   | Export omits Orders, Logistics & Chats  |
| Art. 16 (Rectification)      | [VERIFIED FROM SOURCE]    | PATCH /api/customers/{id} implemented   |
| Art. 17 (Right to Erasure)   | [CRITICAL DEFICIENT]      | Broken cascades; PG & Logistics unpurged|
| Art. 18 (Restriction)        | [EVIDENCE MISSING]        | No processing freeze flag on records    |
| Art. 20 (Data Portability)   | [TECHNICALLY DEFICIENT]   | JSON profile dump lacks transaction data|
| Art. 25 (Privacy by Design)  | [TECHNICALLY DEFICIENT]   | Plaintext HTTP, unencrypted DB volumes  |
| Art. 30 (ROPA)               | [EVIDENCE MISSING]        | No formal processing registry artifacts |
| Art. 32 (Security Measures)  | [TECHNICALLY DEFICIENT]   | Single DB user, shared JWT secrets      |
| Art. 33-34 (Breach Notif.)   | [EVIDENCE MISSING]        | No 72-hour breach workflow or telemetry |
| Art. 44-49 (Cross-Border)    | [LEGAL REVIEW REQUIRED]   | Deployment to GCP asia-south1 & US LLM  |
+------------------------------+---------------------------+-----------------------------------------+
```

---

## 2. Deep Article-by-Article Technical Evaluation

### 2.1 Article 5 — Principles Relating to Processing of Personal Data
- **Article 5(1)(c) Data Minimisation (`[TECHNICALLY DEFICIENT]`):**
  `logistics-service` captures full driver GPS coordinates every few seconds and retains historical routes indefinitely without downsampling or geohash truncating.
- **Article 5(1)(e) Storage Limitation (`[TECHNICALLY DEFICIENT]`):**
  `core-service/src/main/java/com/MaSoVa/core/customer/service/CustomerDataRetentionService.java` (lines 101–104) disables retention by default (`retentionEnabled = false`). Lines 123–126 force a dry run if enabled. Historical order, chat, and driver telemetry records are stored perpetually without automated compaction or destruction.
- **Article 5(1)(f) Integrity and Confidentiality (`[TECHNICALLY DEFICIENT]`):**
  Zero column-level encryption in PostgreSQL `commerce_schema.orders` or MongoDB `orders`. Database credentials (`masova` / `masova_dev_pwd`) and JWT secrets (`0123456789abcdef...`) are committed in cleartext inside `docker-compose.yml`.

---

### 2.2 Article 17 — Right to Erasure ("Right to be Forgotten") (`[CRITICAL DEFICIENT]`)

Article 17 represents the single most dangerous legal defect in the MaSoVa ecosystem. The engineering team claims GDPR compliance based on `CustomerService.anonymizeAndDeleteCustomer`. Technical inspection reveals that erasure requests fail across multiple services, leaving cleartext personal data intact.

#### Fatal Defect 1: Unimplemented Cascading Anonymization in Core Service
In `core-service/src/main/java/com/MaSoVa/core/customer/service/CustomerService.java`:
```java
// Lines 1185-1196
Customer anonymized = customerRepository.save(customer);

logger.info("GDPR: Customer {} anonymized successfully. Original email: {}, phone: {}",
        id,
        PiiMasker.maskEmail(originalEmail),
        PiiMasker.maskPhone(originalPhone));

// TODO: Implement cascading anonymization to other services:
// - order-service: anonymize customerName, customerEmail, customerPhone in orders
// - payment-service: anonymize customerEmail, customerPhone in transactions
// This should be done via:
// 1. Publishing a CustomerAnonymizedEvent to a message broker, OR
// 2. Calling REST endpoints on other services

return anonymized;
```
When a customer triggers account deletion or GDPR erasure, `core-service` modifies its own local customer document, logs the action, hits a `TODO` comment, and returns. No event is published to RabbitMQ. No REST calls are made to downstream services.

#### Fatal Defect 2: Dual-Write Asymmetry in Commerce Service
In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`:
```java
// Lines 1405-1418
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
    log.info("Anonymised {} orders for customer {}", orders.size(), customerId);
}
```
`orderRepository` is a Spring Data MongoDB interface. `OrderJpaRepository` (which writes to PostgreSQL `commerce_schema.orders` during order creation at line 302) is **never queried and never updated**. As a result:
- MongoDB orders show `"ANONYMIZED"`.
- PostgreSQL orders permanently retain the customer's legal name, phone number, email address, and physical delivery address.
- Any reporting query, financial audit, or database backup of PostgreSQL exposes the non-erased PII, constituting an immediate violation of Art. 17.

#### Fatal Defect 3: False Declaration of "No PII" in Logistics Service
In `logistics-service/src/main/java/com/MaSoVa/logistics/delivery/controller/DeliveryController.java`:
```java
// Lines 390-400
public ResponseEntity<Void> gdprAnonymize(
        @RequestParam String customerId,
        jakarta.servlet.http.HttpServletRequest request) {
    String internalCaller = request.getHeader("X-Internal-Service");
    if (internalCaller == null || internalCaller.isBlank()) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).build();
    }
    // DeliveryTracking stores no customer PII — nothing to anonymise
    log.info("GDPR anonymize delivery tracking for customerId={}: no PII stored, no-op", customerId);
    return ResponseEntity.ok().build();
}
```
The controller returns HTTP 200 after logging that no PII is stored. However, `logistics-service/src/main/java/com/MaSoVa/logistics/delivery/entity/DeliveryTracking.java` lines 45–46 explicitly define:
```java
private DeliveryAddress pickupAddress;
private DeliveryAddress deliveryAddress;
```
`DeliveryAddress` contains full street addresses, door codes, and GPS coordinates. By treating this endpoint as a no-op, the platform retains physical residential delivery addresses indefinitely in logistics databases.

#### Fatal Defect 4: Payment Service Lacks GDPR Handling
`payment-service` stores customer email, phone, and billing details in MongoDB `transactions`. The service exposes zero GDPR anonymization endpoints and subscribes to zero anonymization queues.

---

### 2.3 Article 15 & Article 20 — Right of Access & Data Portability (`[TECHNICALLY DEFICIENT]`)

- The platform provides `CustomerExportService.java` in `core-service`.
- However, the export payload only extracts fields from `core_schema.customers`.
- It does **not** aggregate:
  1. Transaction records from `payment-service`.
  2. Order history itemizations from `commerce-service`.
  3. Delivery route histories and location stamps from `logistics-service`.
  4. AI Support chat transcripts and customer support tickets from `masova-support`.
- An Article 15 Data Subject Access Request (DSAR) fulfilled using this endpoint would provide an incomplete and legally deficient disclosure.

---

### 2.4 Article 25 — Data Protection by Design and by Default (`[TECHNICALLY DEFICIENT]`)

- Data protection by design requires architectural isolation of personal identifiers.
- In MaSoVa, internal microservice APIs exchange unmasked personal data (`customerPhone`, `customerEmail`, `deliveryAddress`) directly over plaintext HTTP headers and JSON bodies.
- Tenant isolation is non-existent at the database level: multiple restaurants share the exact same MongoDB database and PostgreSQL schema without row-level security (`CREATE POLICY ... ON ... FOR ALL TO CURRENT_USER`). A SQL injection or flawed query in one tenant leaks personal data across all European restaurants on the platform.

---

### 2.5 Articles 33 & 34 — Notification of Personal Data Breaches (`[EVIDENCE MISSING]`)

- GDPR mandates breach notification to the competent Supervisory Authority (e.g., CNIL in France, BfDI in Germany, DPC in Ireland) within **72 hours** of becoming aware of a personal data breach.
- There is zero technical alerting configured in Prometheus, Alertmanager, or CloudWatch for unauthorized PII queries, bulk table exfiltrations, or credential stuffing.
- There is no incident runbook, breach log template, or forensic audit trail capability implemented in the repository.

---

### 2.6 Chapter V (Articles 44–49) — Transfers of Personal Data to Third Countries (`[LEGAL REVIEW REQUIRED]`)

Under the CJEU *Schrems II* ruling and GDPR Chapter V, transferring personal data outside the European Economic Area (EEA) requires an adequacy decision or standard contractual clauses (SCCs) accompanied by supplementary technical measures (e.g., end-to-end encryption where keys are held exclusively in the EU).

The platform contains two direct violations of Chapter V:
1. **Cloud Run Deployment Region (`.github/workflows/deploy.yml:90-95`):**
   The CI/CD pipeline deploys the production backend to GCP region `asia-south1` (India). India has not received an adequacy decision under Art. 45 GDPR. Storing European customer PII on Indian infrastructure without documented transfer mechanisms creates severe civil liability and risks regulatory injunctions halting operations.
2. **AI Support Service Gemini Integration (`masova-support/src/masova_agent/main.py`):**
   Customer queries containing personal names, order issues, and delivery addresses are transmitted to `generativelanguage.googleapis.com` (US endpoints) without enterprise zero-data-retention agreements or EU data boundary enforcement.

---

## 3. Financial & Regulatory Penalty Assessment

Under Article 83(5) GDPR, infringements of the basic principles for processing (Art. 5), data subjects' rights (Arts. 12–22), and cross-border transfers (Arts. 44–49) are subject to administrative fines up to:
$$\text{Max Fine} = \max(€20,000,000,\ 4\% \text{ of Total Global Annual Turnover})$$

Given the structural defects in Article 17 erasure, the cross-border transfers to India and the United States, and the lack of encryption at rest, a European deployment in the current state would face an immediate shutdown order from European data protection authorities alongside maximum tier financial penalties.

---

## 4. Mandatory Remediation Checklist Before Go-Live

To achieve legal readiness under GDPR, the following technical prerequisites must be satisfied:

1. **Transactional Erasure Orchestration:**
   Implement a reliable Saga or RabbitMQ durable topic (`customer.gdpr.erasure`) where `core-service`, `commerce-service` (both Mongo and PostgreSQL), `payment-service`, and `logistics-service` participate in distributed erasure, with cryptographic confirmation logged in an append-only audit ledger.
2. **PostgreSQL Column Encryption:**
   Enable `pgcrypto` or application-level AES-256-GCM envelope encryption for all customer and driver PII fields in PostgreSQL and MongoDB.
3. **Log Sanitization Filter:**
   Deploy a Logback masking appender that regex-strips email addresses, phone numbers, postal addresses, and credit card numbers from all console and file log streams.
4. **EU Sovereign Hosting:**
   Migrate all deployment pipelines and Docker hosts strictly to EU regions (e.g., `europe-west1` in Belgium or `europe-west3` in Frankfurt) and bind Gemini API calls to Vertex AI EU sovereign endpoints.

---

**Board Certification Conclusion:** **REJECT**. The platform cannot process European citizen data in its current architecture.

