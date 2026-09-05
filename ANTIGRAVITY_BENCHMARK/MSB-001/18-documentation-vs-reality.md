# 18 - Documentation Claims vs. Implementation Realities

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Summary

This document presents a comprehensive cross-examination of claimed architectural capabilities, system runbooks, and design decisions against the concrete lines of code running in production repositories.

---

## 2. Cross-Examination Matrix

### 2.1 Persistence & Dual-Write Architecture
* **Documented Claim:**
  * `docs/guidelines/domain-rules.md:L37`: *"Perform PostgreSQL writes synchronously first, followed by MongoDB writes asynchronously in a try/catch block (see Decision D08)."*
  * `docs/guidelines/decisions.md:L68`: *"Writing to MongoDB first and PostgreSQL second is forbidden as it exposes the transactional ledger to data loss if the Postgres write fails."*
* **Implementation Reality:**
  * `core-service/src/main/java/com/MaSoVa/core/user/service/UserService.java:L137-144`: MongoDB is written synchronously first (`userRepository.save(savedUser)`). PostgreSQL is executed second in a `try/catch` block where failure is swallowed with `logger.warn()`.
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L271, L712-725`: MongoDB is saved first. PostgreSQL sync is caught and swallowed in `catch (Exception e)`.
  * `payment-service` and `logistics-service`: Contain **0 JPA entities and 0 JPA repositories**. PostgreSQL persistence is completely non-existent in application code despite Flyway scripts existing.

---

### 2.2 Driver Fulfillment & Dispatch
* **Documented Claim:**
  * `AGENTS.md:L9`: *"Staff App Mobile: React Native 0.83"* / Driver dispatch and order fulfillment application.
* **Implementation Reality:**
  * `MaSoVaCrewApp/src/store/api/orderApi.ts:L83`: Queries `GET /orders/status/{status}`, an endpoint that does not exist in `OrderController.java` (returns **HTTP 404**).
  * `MaSoVaCrewApp/src/store/api/orderApi.ts:L88-91`: Dispatches HTTP `PATCH /orders/{orderId}/status`, while `OrderController.java:L205` strictly requires HTTP `POST` (returns **HTTP 405**).
  * `MaSoVaCrewApp/src/screens/ActiveDeliveryScreen.tsx:L39`: Driver screen filters strictly on `DISPATCHED`. Once an order enters `OUT_FOR_DELIVERY`, it vanishes from the driver's phone.

---

### 2.3 Real-Time Delivery Tracking & Customer UX
* **Documented Claim:**
  * Customer mobile app provides seamless real-time delivery tracking and OTP presentation.
* **Implementation Reality:**
  * `masova-mobile/src/screens/order/OrderTrackingScreen.tsx:L36-43`: `DELIVERY_ORDER_STAGES` omits `OUT_FOR_DELIVERY`.
  * When an order enters transit, `getCurrentStageIndex()` returns `-1`. The progress bar grays out, checkmarks vanish, and the delivery verification OTP card disappears from the screen (`L501`).

---

### 2.4 Customer Cancellation Self-Service
* **Documented Claim:**
  * Customers can cancel their active orders through the mobile application.
* **Implementation Reality:**
  * `masova-mobile/src/services/api/orderApi.ts:L59`: Dispatches `DELETE /orders/{orderId}`.
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L308`: Restricts `DELETE` strictly to `MANAGER, ASSISTANT_MANAGER, STAFF`.
  * Customers receive an unhandled **HTTP 403 Forbidden** error.

---

### 2.5 Security & Perimeter Protection
* **Documented Claim:**
  * Spring Cloud Gateway (`api-gateway:8080`) provides centralized perimeter defense, authenticating tokens and stripping spoofable headers.
* **Implementation Reality:**
  * `docker-compose.yml:L119`: `commerce-service` binds `0.0.0.0:8084` to the host network on Dell IP `192.168.50.88`.
  * `commerce-service/src/main/java/com/MaSoVa/commerce/config/SecurityConfig.java:L51`: Permits unauthenticated access to `/api/orders/*/payment`.
  * `OrderController.java:L383-394`: Accepts unauthenticated caller assertion `X-Internal-Service: payment-service` to mark orders `PAID` with zero credentials.

---

### 2.6 GDPR & Regulatory Erasure
* **Documented Claim:**
  * Platform complies with GDPR data subject erasure mandates.
* **Implementation Reality:**
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L1405-1418`: `anonymizeCustomerOrders()` overwrites PII only in MongoDB. PostgreSQL tables retain customer name, phone, email, and home address in plaintext.

---

### 2.7 European Fiscal Compliance
* **Documented Claim:**
  * Terminal orders are cryptographically signed to satisfy EU fiscal anti-fraud laws.
* **Implementation Reality:**
  * When a delivery is completed via proof-of-delivery OTP, `logistics-service` calls `OrderService.markOrderDelivered()`.
  * `OrderService.java:L1379-1399`: Sets status to `DELIVERED`, but completely omits the call to `fiscalSigningService.signOrder()`. Every POD-verified delivery is fiscally invalid under EU law.

