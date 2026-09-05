# Document 04 — Data Protection & Privacy Engineering Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** MaSoVa Restaurant Management System (Core, Commerce, Payment, Logistics, Intel, Gateway, Frontend, Mobile, AI Agent)
**Evaluator:** Independent Go-Live Board (Production Engineering, Cybersecurity, GDPR / Compliance)
**Date:** September 2026
**Status:** **REJECTED (CRITICAL FAIL)**

---

## 1. Executive Assessment & Data Protection Scorecard

European personal data protection requires strict adherence to privacy-by-design and privacy-by-default under Regulation (EU) 2016/679 (GDPR), national data protection statutes, and European Data Protection Board (EDPB) recommendations. An exhaustive audit of the MaSoVa codebase reveals systematic failures across data classification, encryption at rest, encryption in transit, log sanitization, data retention, and cross-border transfers.

| Dimension                              | Standard / Requirement          | Current State                                                                         | Board Verdict       |
| :------------------------------------- | :------------------------------ | :------------------------------------------------------------------------------------ | :------------------ |
| **Data Classification & Cataloging**   | Art. 30 GDPR / ISO 27701        | Ad-hoc, incomplete annotations; no automated data dictionary                          | **FAIL**            |
| **Encryption at Rest (Databases)**     | Art. 32(1)(a) GDPR              | PostgreSQL & MongoDB unencrypted at column/field level; default tablespaces           | **FAIL**            |
| **Encryption at Rest (Client)**        | OWASP Mobile Top 10 / Art. 32   | React Native `AsyncStorage` / Browser `localStorage` store cleartext tokens & PII     | **FAIL**            |
| **Encryption in Transit (Internal)**   | Art. 32(1)(a) GDPR / Zero-Trust | Cleartext HTTP/1.1 across all internal Docker & Cloud Run container meshes            | **FAIL**            |
| **Logging & Telemetry Sanitization**   | Art. 5(1)(f), Art. 32 GDPR      | Cleartext PII (phone, email, addresses) emitted in logs; pseudo-masking fails         | **FAIL**            |
| **Data Retention & Automated Purging** | Art. 5(1)(e) GDPR               | Retention service stubbed; cascades missing; dead code                                | **FAIL**            |
| **Third-Party Data Exfiltration**      | Chapter V GDPR                  | Cleartext PII routed to US-hosted LLM endpoints (`generativelanguage.googleapis.com`) | **FATAL STOP-SHIP** |

---

## 2. Comprehensive PII Inventory & Data Catalog

The MaSoVa platform ingests, processes, and persists four distinct classes of sensitive European personal data without systematic cryptographic boundaries or unified schema-level access controls.

```
+----------------------------------------------------------------------------------------------------+
|                                    MASOVA PII DATA INVENTORY                                       |
+------------------------------------+-----------------------------------+---------------------------+
| Customer PII                       | Staff / Driver PII                | Financial / Fiscal PII    |
+------------------------------------+-----------------------------------+---------------------------+
| - Full Legal Name                  | - Full Legal Name                 | - Credit Card Last 4      |
| - Primary Email Address            | - Phone Number                    | - Payment Gateway Token   |
| - Mobile Phone Number              | - Hourly Wage / Salary Rate       | - Billing Address         |
| - Delivery Street & Apartment      | - Real-time GPS Coordinates       | - VAT Registration ID     |
| - Geolocation (Lat / Lng)          | - Historical Shift Logs           | - Cash Receipt Signatures |
| - Food Allergies & Diet Notes      | - Performance Ranking / Speed     | - Order Invoice Amount    |
| - Order & Spending History         | - Customer Feedback Ratings       | - Tip Allocations         |
+------------------------------------+-----------------------------------+---------------------------+
```

### 2.1 Customer Data Ingestion Points
- **Core Service (`core-service`):** Customer profile management in `Customer.java` (lines 35–115) stores `name`, `email`, `phone`, `addresses` (nested JSON list of delivery locations), dietary preferences, and loyalty point totals.
- **Commerce Service (`commerce-service`):** Checkout ingestion in `Order.java` and `OrderEntity.java` records customer contact info (`customerName`, `customerPhone`, `customerEmail`), full physical delivery destination (`deliveryAddress.street`, `deliveryAddress.city`, `deliveryAddress.postalCode`, `deliveryAddress.latitude`, `deliveryAddress.longitude`), and order line items disclosing dietary, medical, or religious food preferences (special category data under Art. 9 GDPR).
- **Logistics Service (`logistics-service`):** Order fulfillment tracking in `DeliveryTracking.java` (lines 40–47) ingests customer delivery addresses, contact numbers, and delivery instructions.
- **AI Support Agent (`masova-support`):** Customer inquiries handled by FastAPI + Google Gemini ingest conversational chat logs containing unvetted customer identification, dispute details, and contact information.

### 2.2 Staff & Delivery Rider Data
- **Core Service (`core-service`):** `Staff.java` stores employee legal identity, tax/social security numbers, home addresses, phone numbers, assigned roles, and wage rates.
- **Logistics Service (`logistics-service`):** `DeliveryDriver.java` and `DriverLocation.java` ingest real-time GPS coordinates every 5–15 seconds, creating high-resolution behavioral and location profiles of workers.
- **Intelligence Service (`intelligence-service`):** `AnalyticsService.java` and `BIEngineService.java` ingest staff transaction velocity, table turnover speed, delivery turnaround times, and error rates to compile algorithmic performance leaderboards.

---

## 3. Cryptographic Posture & Encryption at Rest Audit

### 3.1 Primary Databases (PostgreSQL & MongoDB)
- **PostgreSQL (`postgres:15-alpine`):**
  - Database schema initialization in `V1__init_schema.sql` and `V1__payment_schema.sql` creates tables `commerce_schema.orders`, `core_schema.customers`, `core_schema.staff`, and `payment_schema.transactions` without database-level or column-level encryption (e.g., `pgcrypto`).
  - All customer names, phone numbers, email addresses, and street addresses are stored as raw `VARCHAR` or `TEXT` fields.
  - The underlying PostgreSQL storage volumes in `docker-compose.yml` (`postgres_data:/var/lib/postgresql/data`) lack encrypted filesystem bindings (no dm-crypt/LUKS, no AWS KMS / GCP CMEK specification).
- **MongoDB (`mongo:6.0`):**
  - MongoDB stores collections `orders`, `customers`, `delivery_tracking`, and `audit_logs`.
  - MongoDB Community Edition 6.0 does not support native WiredTiger Encryption at Rest (available only in MongoDB Enterprise / Atlas). The local and compose configurations run Community Edition with zero encryption flags enabled.
  - MongoDB collections store nested document structures containing full PII in cleartext JSON.

### 3.2 Client-Side Storage Vulnerabilities (Web & Mobile)
- **Web Frontend (`frontend/src/store/slices/authSlice.ts`):**
  - Lines 46–50, 105–117: When a user selects "Remember Me", `auth_accessToken`, `auth_refreshToken`, and `auth_user` (containing user profile, role, email, and full name) are written directly to browser `localStorage`.
  - `localStorage` is completely unencrypted and accessible to any third-party script executing in the page context via XSS or malicious third-party dependencies.
- **Mobile Applications (`masova-mobile` / `MaSoVaCrewApp`):**
  - Authentication tokens, customer profiles, and driver credentials utilize React Native standard `AsyncStorage`.
  - On Android, `AsyncStorage` writes unencrypted SQLite / XML files to `/data/data/<package>/databases/` or `shared_prefs/`.
  - On iOS, `AsyncStorage` writes unencrypted plist files to `Documents/RCTAsyncLocalStorage_V1`.
  - Neither Android Keystore nor iOS Keychain (`react-native-keychain` / EncryptedSharedPreferences) is utilized for token or credential persistence.

---

## 4. Encryption in Transit & Internal Boundary Vulnerabilities

### 4.1 Absence of Internal TLS (mTLS)
- The gateway terminates TLS (when configured in production) or receives HTTP on port 8080.
- All intra-service communication between `api-gateway`, `core-service` (8085), `commerce-service` (8084), `payment-service` (8089), `logistics-service` (8086), and `intelligence-service` (8087) is transmitted over unencrypted HTTP/1.1.
- REST templates in `core-service/src/main/java/com/MaSoVa/core/user/client/*` use plaintext URIs:
  ```java
  // CustomerServiceClient.java: line 85
  String url = orderServiceUrl + "/api/orders/gdpr/anonymize?customerId=" + customerId;
  ```
- RabbitMQ event traffic on port 5672 is unencrypted AMQP (not AMQPS/TLS). Any packet sniffer, compromised container, or network tap inside the VPC/Docker bridge captures full event payloads, including order details, customer addresses, and payment references.

---

## 5. Telemetry & Log PII Exfiltration Audit

A review of SLF4J / Logback invocations across the microservices demonstrates direct PII leakage into application stdout and container log collectors.

### 5.1 Cleartext PII Logging Instances
1. **Core Service (`CustomerService.java:1185-1188`):**
   ```java
   logger.info("GDPR: Customer {} anonymized successfully. Original email: {}, phone: {}",
           id,
           PiiMasker.maskEmail(originalEmail),
           PiiMasker.maskPhone(originalPhone));
   ```
   *Flaw:* While `PiiMasker` is used here, inspecting `PiiMasker.java` reveals that short email usernames and phones fail to mask securely, and `originalEmail` / `originalPhone` were held unmasked in JVM heap memory during the transaction.
2. **Commerce Service (`OrderService.java:310`):**
   ```java
   log.info("Order created: id={}, customer={}, total={}", order.getId(), order.getCustomerName(), order.getTotalAmount());
   ```
   *Flaw:* Customer legal name is written directly to application logs for every placed order.
3. **Logistics Service (`DeliveryController.java:398`):**
   ```java
   log.info("GDPR anonymize delivery tracking for customerId={}: no PII stored, no-op", customerId);
   ```
   *Flaw:* Logs customer UUIDs alongside erroneous compliance claims.
4. **AI Support Service (`src/masova_agent/main.py`):**
   - FastAPI request logging dumps incoming JSON payloads containing user conversational queries, phone numbers, and delivery complaint details directly into standard out.

---

## 6. Data Retention, Minimization, & Deletion Architecture Audit

Article 5(1)(e) GDPR mandates that personal data shall be kept in a form which permits identification of data subjects for no longer than is necessary for the purposes for which the personal data are processed.

### 6.1 Customer Data Retention Service Deficiencies
In `core-service/src/main/java/com/MaSoVa/core/customer/service/CustomerDataRetentionService.java`:
- **Line 95–96:** Audit log purging is completely un-implemented:
  ```java
  // In production, implement audit log repository and purge logic
  return 0;
  ```
- **Lines 101–104:** Data retention job checks `if (!retentionEnabled) return 0;`. In `application.yml`, `masova.retention.enabled` defaults to `false`.
- **Lines 123–126:** If enabled, `dryRun` defaults to `true`:
  ```java
  if (dryRun) {
      log.info("DRY RUN: Would anonymize {} customers", inactiveCustomers.size());
      return inactiveCustomers.size();
  }
  ```
- **Lines 130–136:** When the job runs against inactive customers, it calls `customerService.anonymizeAndDeleteCustomer(id, "RETENTION_POLICY_EXPIRY")`. As identified in Document 02, this method has a `// TODO` at line 1190 and **does not cascade** to orders, payments, or logistics. Customer PII in orders remains retained indefinitely.

---

## 7. Cross-Border Data Transfers & Third-Party Processors

### 7.1 Illegal Cross-Border Transfer to Google Gemini (US)
- The AI Support Agent (`masova-support/src/masova_agent/main.py`) integrates with Google Gemini via `google-genai` using API endpoint `generativelanguage.googleapis.com`.
- There is no EU data residency lock configured (`gemini-1.5-flash` endpoint defaults to US data processing clusters).
- Customer chats (including complaints regarding late deliveries containing physical addresses, customer full names, phone numbers, and food orders) are forwarded without Data Processing Agreements (DPA), Standard Contractual Clauses (SCCs), or Transfer Impact Assessments (TIA) under Art. 46 GDPR.

### 7.2 Hosting Region Mismatch
- `.github/workflows/deploy.yml` lines 90–95 deploy backend containers to Google Cloud Run in region **`asia-south1` (Mumbai, India)**.
- Deploying European citizen personal data, payment records, and employee telemetry to Indian infrastructure without binding corporate rules or an adequacy decision violates GDPR Chapter V (Articles 44–49).

---

## 8. Summary of Stop-Ship Data Protection Defects

```
[CRITICAL BLOCKER] DP-01: Cross-border data transfer violation — production deployment scripts target GCP asia-south1.
[CRITICAL BLOCKER] DP-02: Cleartext customer PII stored in PostgreSQL commerce_schema.orders without column encryption.
[CRITICAL BLOCKER] DP-03: MongoDB Community Edition running without encryption at rest.
[CRITICAL BLOCKER] DP-04: Cleartext auth tokens and user profile cached in browser localStorage and mobile AsyncStorage.
[CRITICAL BLOCKER] DP-05: Customer chat PII transferred to unverified US Gemini API endpoints without EU data boundary locks.
[CRITICAL BLOCKER] DP-06: CustomerDataRetentionService defaults to dry-run/disabled and lacks cross-service cascading.
```

**Board Certification Conclusion:** **REJECT**. The data protection architecture fails minimum European legal standards.

