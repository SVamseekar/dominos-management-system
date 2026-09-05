# 16 - Legal, Regulatory, & Compliance Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Regulatory Context

As a restaurant platform operating across both India and the European Union (Germany, France, UK, Italy, Belgium, Hungary), MaSoVa must comply with:
1. **GDPR (General Data Protection Regulation - Regulation (EU) 2016/679):** Specifically Article 17 ("Right to Erasure" / "Right to be Forgotten").
2. **EU Fiscalization Mandates:** Mandatory cryptographic signing of electronic receipts (Germany TSE, France NF525, Belgium FDM, Italy RT, UK MTD).
3. **Food Safety & Allergen Disclosure:** Traceability of ingredients and consumer allergen alerts.

---

## 2. Compliance Failures & Code Reality

### 2.1 GDPR Article 17 Violation: Asymmetric Erasure Leaving PostgreSQL PII Intact
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`
* **Symbol:** `anonymizeCustomerOrders`
* **Lines:** 1405–1418
* **Implementation:**
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
      log.info("Anonymised {} orders for customer {}", orders.size(), customerId);
  }
  ```
* **Statutory Violation Analysis:**
  * Notice that `orderRepository.save(order)` operates solely on MongoDB.
  * `orderJpaRepository` or `syncToPostgres()` is **never invoked**.
  * In PostgreSQL, the `orders` relational table retains the customer's full name, telephone number, email address, and physical street delivery address.
  * When a data subject requests erasure under GDPR Article 17, the operator issues a confirmation of erasure, but the personal data remains permanently accessible in the PostgreSQL database.
  * **Regulatory Penalty:** Fines up to €20,000,000 or 4% of global annual turnover under GDPR Art. 83(5)(b).

---

### 2.2 EU Fiscal Evasion: POD Deliveries Completely Bypass Fiscal Signing
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/fiscal/FiscalSigningService.java:L21-30, L57-60`
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L502-504, L1379-1399`
* **Analysis:**
  * In `updateOrderStatus()` (`L502-504`), fiscal signing is explicitly triggered for terminal order states:
    ```java
    if (newStatus == OrderStatus.DELIVERED || newStatus == OrderStatus.COMPLETED || newStatus == OrderStatus.SERVED) {
        fiscalSigningService.signOrder(updatedOrder);
    }
    ```
  * However, when a delivery is verified and fulfilled in the real world via proof-of-delivery OTP, `logistics-service` calls `OrderService.markOrderDelivered(orderId, deliveredAt, proofType)` (`L1379-1399`).
  * `markOrderDelivered()` sets `order.setStatus(OrderStatus.DELIVERED)` and returns.
  * **`fiscalSigningService.signOrder()` is NEVER called.**
* **Statutory Violation Analysis:**
  * Every delivery order completed through proof-of-delivery verification bypasses cryptographic fiscal hardware/cloud signing (TSE in Germany, NF525 in France).
  * The orders are recorded as delivered without cryptographic audit signatures, rendering the merchant non-compliant with European tax authority anti-fraud laws.

---

### 2.3 Allergen Ingestion & Cross-Contamination Gaps
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **Analysis:**
  * Recipes track ingredients, but dynamic ingredient substitutions and modifier notes entered during customer checkout are stored as unstructured text strings (`specialInstructions`).
  * No programmatic safety assertion validates customer allergen exclusions against sub-ingredient recipes prior to kitchen ticket generation.

