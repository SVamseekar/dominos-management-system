# 01 — Test 1: Opening the Restaurant

**Benchmark:** MSB-002
**Title:** European Single-Restaurant Operational Readiness
**Perspective:** Technical Due Diligence for Opening an EU Restaurant Tomorrow
**Auditor:** Independent Systems & Compliance Engineer
**Status Tags:** `[VERIFIED FROM SOURCE]`, `[STRONGLY INFERRED]`, `[REQUIRES RUNTIME VALIDATION]`, `[REQUIRES LEGAL/TAX REVIEW]`

---

## 1. Scenario Context

The restaurant owner intends to open a single restaurant establishment located in the European Union tomorrow morning (e.g. in Berlin, Paris, Amsterdam, or Rome). The restaurant offers dine-in seating, counter takeaway, and direct home delivery.

To open, the owner must configure fifteen operational capabilities in the MaSoVa software ecosystem. Below is the source-code trace determining whether each capability can be successfully configured and relied upon.

---

## 2. Fifteen Operational Readiness Dimensions

### 1. Restaurant Identity (Legal Name, Registration, Imprint)
* **Status:** ❌ **FAIL (Critical Configuration Blocker)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `shared-models/src/main/java/com/MaSoVa/shared/entity/Store.java:L40-44`
  * `core-service/src/main/java/com/MaSoVa/core/user/controller/StoreController.java:L88-94`
* **Findings:**
  1. In `Store.java:L41`, the store code field is strictly constrained by Jakarta Bean Validation:
     ```java
     @NotNull
     @Field("code")
     @Indexed(unique = true)
     @Pattern(regexp = "^DOM\\d{3}$", message = "Store code must be format DOM001")
     @JsonProperty("storeCode")
     private String code;
     ```
     An EU operator attempting to configure an intuitive store code (e.g., `BERLIN01`, `PARIS_CENTRE`, `AMS_DINE`) will be rejected with HTTP 400 Validation Error. Only legacy Domino's codes (`DOM001` to `DOM999`) pass validation.
  2. In `Store.java:L84-99`, recent fields were added for internationalization: `countryCode` (e.g. `"DE"`), `vatNumber`, `currency` (`"EUR"`), and `locale` (`"de-DE"`).
  3. However, mandatory European company registration metadata is completely absent from the domain model:
     * No commercial register number (e.g., German *Handelsregisternummer* HRB, French *Numéro RCS*, Dutch *KvK-nummer*).
     * No legal business structure indicator (e.g., GmbH, SAS, B.V., S.r.l.).
     * No statutory representative / managing director (*Geschäftsführer* / *Gérant*).
     * No mandatory website/app legal imprint (*Impressum* per German TMG / EU E-Commerce Directive 2000/31/EC).

---

### 2. Location (Coordinates, Geofencing, Delivery Zones)
* **Status:** ⚠️ **PARTIALLY FUNCTIONAL** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `shared-models/src/main/java/com/MaSoVa/shared/entity/Store.java:L126-150, L371-468`
  * `core-service/src/main/java/com/MaSoVa/core/user/service/StoreService.java:L48-68`
  * `logistics-service/src/main/java/com/MaSoVa/logistics/delivery/service/DeliveryZoneService.java:L35-90`
* **Findings:**
  1. The store location uses Haversine spherical distance calculation (`Store.java:L139-150`) against `address.latitude` and `address.longitude` to determine if a customer is within `configuration.deliveryRadiusKm`.
  2. `ServiceArea` and `DeliveryZone` classes (`Store.java:L371-468`) support concentric distance rings (Zone A: 0–3km, Zone B: 3–6km, Zone C: 6–10km) and optional polygon coordinates (`polygonCoordinates`).
  3. **Currency Defect:** `DeliveryZone.java:L428,L430,L458,L464` hardcodes field names in Indian Rupees (`deliveryFeeINR`, `minimumOrderValueINR`), which leaks through API JSON serialization. While the numeric values function as floating-point decimals, frontend components expecting generic currency or euro amounts display currency symbol mismatches unless specifically mapped.

---

### 3. VAT Configuration (Tax Rates per Context & Country)
* **Status:** ❌ **FAIL (Severe Regulatory Defect)** `[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
* **Code Trace:**
  * `commerce-service/src/main/resources/application.yml:L259-340`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/config/EuVatConfiguration.java:L24-73`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/EuVatEngine.java:L36-60`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L174-205`
* **Findings:**
  1. **No Dynamic/UI Configuration:** VAT rates cannot be configured or altered at runtime by the restaurant owner via the management portal or REST API. Rates are hardcoded in static `application.yml` files.
  2. **Limited Country Coverage:** Only six EU countries have configured rate matrices (`DE`, `FR`, `IT`, `NL`, `BE`, `HU`). If the restaurant is located in Austria (AT), Spain (ES), Portugal (PT), Ireland (IE), Poland (PL), Sweden (SE), or any of the other 21 Member States, `EuVatConfiguration.lookupRate()` returns `0.0`.
  3. **Gross vs. Net Inversion:** `EuVatEngine.java:L45-50` treats menu item prices as **net** (ex-VAT) and calculates VAT on top:
     ```java
     BigDecimal net = BigDecimal.valueOf(item.getPrice()).multiply(BigDecimal.valueOf(item.getQuantity())).setScale(2, RoundingMode.HALF_UP);
     BigDecimal vat = net.multiply(BigDecimal.valueOf(vatRatePct / 100.0)).setScale(2, RoundingMode.HALF_UP);
     BigDecimal gross = net.add(vat);
     ```
     Under the EU Price Indication Directive (Directive 98/6/EC) and national laws (e.g. German *Preisangabenverordnung* - PAngV), consumer-facing prices in restaurants MUST be VAT-inclusive. Calculating VAT on top inflates the customer's total at checkout beyond the advertised menu price.
  4. **Untaxed Delivery Fees:** `OrderService.java:L192-194` appends the delivery fee directly to `total` without computing VAT. In European tax jurisdictions, delivery is an ancillary service that must bear VAT (either standard rate or proportional to items).
  5. **Maharashtra GST Fallback:** In `OrderService.java:L174-204`, if `storeServiceClient.getStore()` encounters a network glitch or timeout, `countryCode` resolves to `null`. The engine falls back to Indian GST for the state of Maharashtra, charging CGST and SGST on a European diner's bill.

---

### 4. Menu & Pricing Structure
* **Status:** ⚠️ **PARTIALLY FUNCTIONAL** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `commerce-service/src/main/java/com/MaSoVa/commerce/menu/entity/MenuItem.java:L1-120`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/menu/controller/MenuController.java:L40-190`
  * `frontend/src/store/api/menuApi.ts:L10-150`
* **Findings:**
  1. Menu items support categories, names, descriptions, base prices, discounted prices, and preparation times.
  2. `StoreService.java:L74-77` automatically resolves store currency to `"EUR"` when `countryCode` is set to an EU country.
  3. However, modifier pricing (e.g., extra cheese, plant-based milk surcharge) is modeled as simple string tags or flat arrays, lacking granular VAT-rate association (e.g., dairy vs. oat milk tax differentials in certain Member States).

---

### 5. Allergens (EU FIC Regulation 1169/2011)
* **Status:** ✅ **FUNCTIONAL / VERIFIED FROM SOURCE**
* **Code Trace:**
  * `shared-models/src/main/java/com/MaSoVa/shared/enums/AllergenType.java:L1-19`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/menu/service/MenuService.java:L29-35, L324-335`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/menu/controller/MenuController.java:L178-190`
  * `frontend/src/pages/customer/MenuPage.tsx:L2-28, L682-695`
  * `masova-mobile/src/screens/menu/ItemDetailScreen.tsx:L410-440`
* **Findings:**
  1. `AllergenType.java` models all 14 statutory allergens mandated by Annex II of EU Regulation (EU) No 1169/2011:
     `CELERY`, `CEREALS_GLUTEN`, `CRUSTACEANS`, `EGGS`, `FISH`, `LUPIN`, `MILK`, `MOLLUSCS`, `MUSTARD`, `NUTS`, `PEANUTS`, `SESAME`, `SOYA`, `SULPHUR_DIOXIDE`.
  2. `MenuService.java:L31-34` implements an enforced **Allergen Gate**:
     ```java
     private void enforceAllergenGate(MenuItem item) {
         if (Boolean.TRUE.equals(item.getIsAvailable()) && !item.isAllergensDeclared()) {
             throw new BusinessException("allergens must be declared before making a menu item available. Use PATCH /api/menu/items/{id}/allergens first.");
         }
     }
     ```
     A dish cannot be set to active/available in the restaurant catalog without explicit declaration of allergen contents (or explicit declaration as `allergenFree: true`).
  3. Frontend web and mobile applications display allergen warnings and chips on item detail screens.

---

### 6. Employees & Identity Provisioning
* **Status:** ⚠️ **PARTIALLY FUNCTIONAL** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `core-service/src/main/java/com/MaSoVa/core/user/entity/User.java:L1-150`
  * `core-service/src/main/java/com/MaSoVa/core/user/service/UserService.java:L80-160`
  * `core-service/src/main/java/com/MaSoVa/core/user/controller/UserController.java:L50-120`
* **Findings:**
  1. The owner can register employees via `POST /api/users` or `POST /api/auth/register`, assigning them to a specific `storeId`.
  2. Passwords are encrypted with BCrypt (`PasswordEncoder`).
  3. PIN validation is supported via `POST /api/auth/validate-pin` for fast terminal unlocking.
  4. **Limitation:** Employee employment contracts, tax identification numbers (e.g., German *Steuer-ID*, French *Numéro de sécurité sociale*), and hourly wage parameters are not supported in the entity model.

---

### 7. Staff Roles & Permissions
* **Status:** ⚠️ **DEGRADED / ROLE DRIFT** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `shared-models/src/main/java/com/MaSoVa/shared/enums/UserType.java:L3-10`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L109,L206,L218`
* **Findings:**
  1. Supported enums: `CUSTOMER`, `STAFF`, `DRIVER`, `MANAGER`, `ASSISTANT_MANAGER`, `KIOSK`.
  2. Kitchen staff and cashiers are both collapsed into the generic `STAFF` role. There is no isolated `CHEF` or `KITCHEN_OPERATOR` role.
  3. Kiosks are assigned role `KIOSK`, but in `OrderController.java:L109`, `POST /api/orders` allows only `CUSTOMER, MANAGER, ASSISTANT_MANAGER, STAFF`. The kiosk role cannot create orders unless masquerading as a customer or staff member.

---

### 8. Payment Methods
* **Status:** ❌ **FAIL (No Physical POS Hardware Support)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `payment-service/src/main/java/com/MaSoVa/payment/gateway/StripeGateway.java:L1-180`
  * `payment-service/src/main/java/com/MaSoVa/payment/controller/PaymentController.java:L50-80`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L380-396`
* **Findings:**
  1. `StripeGateway.java` supports Stripe PaymentIntents via web and mobile SDKs (`stripeClientSecret`).
  2. Cash payments are supported by setting `paymentMethod = CASH` on the order; the order stays `paymentStatus = PENDING` until staff update it.
  3. **Physical POS In-Store Absence:** There is zero integration with Stripe Terminal SDK, WisePOS E, BBPOS WisePad, or physical EMV chip-and-PIN / contactless EFTPOS card terminals. A European dine-in restaurant cannot process physical in-person card payments at the table or counter through the software.
  4. **Missing EU Payment Rails:** No native integrations exist for predominant European payment methods: SEPA Direct Debit, iDEAL (Netherlands), Bancontact (Belgium), Giropay/Wero (Germany), or MB Way (Portugal).

---

### 9. Delivery Operations
* **Status:** ❌ **FAIL (Driver App Completely Disconnected)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `MaSoVaCrewApp/src/store/api/orderApi.ts:L82-93`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L37,L144,L205`
  * `logistics-service/src/main/java/com/MaSoVa/logistics/delivery/service/AutoDispatchService.java:L40-120`
* **Findings:**
  1. While the backend `logistics-service` contains sophisticated auto-dispatch algorithms and driver geo-tracking, the driver mobile app cannot connect to it.
  2. In `MaSoVaCrewApp/.../orderApi.ts:L83`, the driver app calls `GET /orders/status/{status}`. The backend removed this endpoint, resulting in **HTTP 404**.
  3. In line 88 of `orderApi.ts`, status updates send `PATCH /orders/{orderId}/status`. The backend requires `POST /{orderId}/status`, resulting in **HTTP 405 Method Not Allowed**.
  4. Drivers cannot view active orders, accept dispatches, or advance deliveries on their mobile devices.

---

### 10. Opening Hours & Timezone Handling
* **Status:** ⚠️ **DEGRADED (Timezone Inflexibility)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `shared-models/src/main/java/com/MaSoVa/shared/entity/Store.java:L301-329`
  * `masova-support/src/masova_agent/agents/shift_optimisation_agent.py:L19`
* **Findings:**
  1. `OperatingHours` correctly models weekly schedules by `DayOfWeek` with `LocalTime` start/end slots and date-specific `SpecialHours`.
  2. However, timestamps and agent schedulers assume India Standard Time (IST) or server-local time without explicit `ZoneId` parameterization per store (e.g. `Europe/Berlin`, `Europe/Paris`). This causes kitchen prep alerts and scheduled jobs to execute hours out of alignment with local restaurant opening times.

---

### 11. Customer Accounts & Guest Checkout
* **Status:** ✅ **FUNCTIONAL / VERIFIED FROM SOURCE**
* **Code Trace:**
  * `core-service/src/main/java/com/MaSoVa/core/customer/service/CustomerService.java:L50-150`
  * `masova-mobile/GUEST_CHECKOUT_IMPLEMENTATION_COMPLETE.md:L1-120`
* **Findings:**
  1. Customer registration, login, profile management, and saved delivery addresses are fully supported.
  2. Guest checkout is implemented in `masova-mobile`, allowing customers to submit delivery details without permanent account creation.

---

### 12. Refunds & Approvals
* **Status:** ❌ **FAIL (Double-Drain Vulnerability)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `payment-service/src/main/java/com/MaSoVa/payment/controller/RefundController.java:L47-100`
  * `payment-service/src/main/java/com/MaSoVa/payment/service/RefundService.java:L153-183`
* **Findings:**
  1. A two-step approval workflow is supported: cashiers/customers request refunds via `POST /api/payments/refund/request`, and managers approve via `POST /api/payments/refund/{id}/approve`.
  2. **Concurrency Hole:** `RefundService.java:L169-183` calculates available refundable balances by querying MongoDB without a distributed lock or transactional version check. If two refund requests are submitted simultaneously, both pass validation and trigger gateway refunds against Stripe, draining funds twice from the merchant.

---

### 13. Receipts & Invoices (EU Commercial Law)
* **Status:** ❌ **FAIL (Non-Compliant Invoice Series)** `[VERIFIED FROM SOURCE]` `[REQUIRES LEGAL/TAX REVIEW]`
* **Code Trace:**
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L857-861`
  * `frontend/src/components/ReceiptGenerator.tsx:L35-58`
* **Findings:**
  1. Under Article 226 of the EU VAT Directive (2006/112/EC), invoices must feature a sequential number based on one or more series that uniquely identifies the document.
  2. `OrderService.java:L857-861` generates order numbers using a random non-sequential string:
     ```java
     private String generateOrderNumber() {
         String timestamp = String.valueOf(System.currentTimeMillis());
         String randomNum = String.format("%04d", SECURE_RANDOM.nextInt(10000));
         return "ORD" + timestamp.substring(timestamp.length() - 6) + randomNum;
     }
     ```
  3. `ReceiptGenerator.tsx` produces an in-browser HTML page defaulting to hardcoded Bangalore, India metadata (`taxLabel = 'Tax (5% GST)'`). There is no PDF generation engine, no digital seal, and no B2B customer VAT reverse-charge invoicing.

---

### 14. Loyalty Program
* **Status:** ⚠️ **PARTIALLY FUNCTIONAL** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `core-service/src/main/java/com/MaSoVa/core/customer/entity/Customer.java:L80-120`
  * `core-service/src/main/java/com/MaSoVa/core/customer/service/CustomerService.java:L200-260`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L1379-1399`
* **Findings:**
  1. Points accumulation and tier tracking (`BRONZE`, `SILVER`, `GOLD`, `PLATINUM`) exist in `Customer.java`.
  2. **Delivery Black Hole:** In `OrderService.java:L1379-1399` (`markOrderDelivered`), when an order is completed by a driver via OTP, `customerServiceClient.updateOrderStats()` is **never called**. Customers who order delivery never earn loyalty points for completed orders.

---

### 15. Analytics & Tax Reporting
* **Status:** ❌ **FAIL (No Fiscal Export / Incomplete Pipeline)** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `intelligence-service/src/main/java/com/MaSoVa/intelligence/analytics/service/AnalyticsService.java:L1-100`
  * `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java:L1379-1399`
* **Findings:**
  1. Analytics service computes aggregate revenue, average order value, and product performance.
  2. However, because `markOrderDelivered()` does not publish RabbitMQ events, delivery sales do not flow into real-time analytics queues.
  3. No fiscal daily audit ledger (Z-Report / *Tagesabschluss* / *Grand Total* accumulator) exists to satisfy tax audit inspection standards (e.g., German DSFinV-K or French FEC).

---

## 3. Opening Day Conclusion

| Capability        | Configurable Tomorrow? | Blocking Issue                                                                      |
| :---------------- | :--------------------: | :---------------------------------------------------------------------------------- |
| **1. Identity**   |          ❌ NO          | Store code regex `^DOM\d{3}$` rejects real restaurant codes; legal imprint missing. |
| **2. Location**   |     ⚠️ YES (Flawed)     | Functional, but currency fields serialized as `...INR`.                             |
| **3. VAT**        |          ❌ NO          | Hardcoded in YAML; net-calculated; delivery fee untaxed; limited to 6 countries.    |
| **4. Menu**       |         ⚠️ YES          | Functional for base catalog; modifier tax mapping absent.                           |
| **5. Allergens**  |         ✅ YES          | Fully compliant with EU 1169/2011; enforced by backend gate.                        |
| **6. Employees**  |         ⚠️ YES          | Functional user creation; local employment/tax fields missing.                      |
| **7. Roles**      |         ⚠️ YES          | Coarse-grained `STAFF`; kiosk role blocked from creating orders.                    |
| **8. Payments**   |          ❌ NO          | Zero physical POS terminal integration; no European local payment rails.            |
| **9. Delivery**   |          ❌ NO          | Driver app receives HTTP 404/405; deliveries cannot be dispatched or tracked.       |
| **10. Hours**     |         ⚠️ YES          | Functional schedule; timezone hardcoded to IST/server-local.                        |
| **11. Customers** |         ✅ YES          | Customer accounts and guest checkout functional.                                    |
| **12. Refunds**   |          ❌ NO          | Concurrent requests cause double gateway refunds.                                   |
| **13. Receipts**  |          ❌ NO          | Non-sequential invoice numbers; browser HTML default with 5% India GST.             |
| **14. Loyalty**   |     ⚠️ YES (Flawed)     | Points system works, but deliveries bypass loyalty accumulation.                    |
| **15. Analytics** |          ❌ NO          | Delivery orders missing from event stream; zero fiscal Z-reporting.                 |

**Final Owner Recommendation:** **DO NOT OPEN.** 8 of 15 foundational capabilities fail or present critical business and legal vulnerabilities.

