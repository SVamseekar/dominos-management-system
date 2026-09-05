# MSB-003 — European Multi-Store Chain Readiness Audit
## Document 01: Tenant Model & Multi-Tenancy Hierarchy Audit

**Target Enterprise:** European Restaurant Chain (100 Stores, 5 EU Countries)  
**Evaluator:** CTO & Enterprise Architecture Board  
**Scope:** `core-service`, `shared-models`, `shared-security`, MongoDB, PostgreSQL, RabbitMQ, Redis, WebSockets  
**Confidence Classification:** `[VERIFIED]` (Derived directly from static source analysis)  
**Verdict:** **NON-EXISTENT MULTI-TENANCY (FLAT STORE MODEL)**  

---

### 1. Theoretical Enterprise Hierarchy vs. MaSoVa Reality

To operate an enterprise restaurant chain across Europe, the software architecture must support a strict, multi-tiered organizational hierarchy:

```
[ENTERPRISE] (Holding Company / European Group)
     │
     ├── [COUNTRY] (Jurisdiction: DE, FR, ES, NL, IT - VAT, Fiscal, Labor Laws)
     │        │
     │        ├── [LEGAL ENTITY] (Operating Corporate Entity / Franchisee Company - Tax ID / HR)
     │        │        │
     │        │        ├── [BRAND] (e.g., Pizza Brand A, Burger Brand B)
     │        │        │        │
     │        │        │        └── [STORE] (Physical Restaurant / Ghost Kitchen - Inventory, POS, KDS)
     │        │        │                 │
     │        │        │                 ├── [EMPLOYEE] (Manager, Kitchen, Driver - Bound to Store & Legal Entity)
     │        │        │                 └── [ORDER] (Bound to Store, Fiscal Regime & Country VAT)
     │        │        │
     │        │        └── [CUSTOMER] (Global/Regional Identity, Loyalty, GDPR Consent)
```

#### Code-Level Reality in MaSoVa:
A forensic search across all models in `shared-models`, `core-service`, `commerce-service`, and `intelligence-service` reveals:
1. **No `Enterprise` entity:** Zero classes, database collections, or JPA tables represent the overarching enterprise holding company.
2. **No `Country` entity:** Countries exist solely as a loose 2-letter string attribute on `Store` (`countryCode`) and a hardcoded static lookup map in `CountryProfileService.java:L15-43`. There is no country-level configuration object in the database.
3. **No `LegalEntity` entity:** There is no concept of a franchisee, operating corporate entity, or legal employer. Contracts, corporate tax IDs (USt-IdNr, SIRET, CIF), and bank settlement accounts cannot be modeled per franchisee.
4. **No `Brand` entity:** Multi-brand operations within a shared kitchen (virtual / ghost kitchen) are impossible.
5. **The Sole Tenant Boundary is `Store`:** The architecture treats `Store` as the root of the world, with severe constraints.

---

### 2. The Hardcoded Store Constraint (`Store.java`)

In `shared-models/src/main/java/com/MaSoVa/shared/entity/Store.java`:
```java
Line 40:     @Indexed(unique = true)
Line 41:     @Pattern(regexp = "^DOM\\d{3}$", message = "Store code must be format DOM001")
Line 42:     @JsonProperty("storeCode")
Line 43:     @JsonAlias({"code", "storeCode"})
Line 44:     private String code;
```

#### Architectural & Operational Blast Radius:
1. **Hard Limit of 999 Stores:** The regular expression `^DOM\d{3}$` strictly enforces a 3-digit numeric format preceded by the letters `DOM`. The maximum number of stores the platform can ever provision is 999 (`DOM001` through `DOM999`).
2. **Brand-Specific Hardcoding:** The prefix `DOM` represents a legacy hardcoded mock for Domino's. An enterprise operating under its own brand (e.g. `EUR-DE-001`, `FR-PAR-010`) cannot provision a store code that reflects its actual enterprise nomenclature without failing Jakarta Bean Validation (`@Pattern`).
3. **No Country or Franchise Partitioning in Code:** A store code contains no prefix or namespace indicating its country, legal entity, or regional cluster.

---

### 3. Role & Identity Constraints (`UserType.java`)

In `shared-models/src/main/java/com/MaSoVa/shared/enums/UserType.java`:
```java
Line 3:  public enum UserType {
Line 4:      CUSTOMER,
Line 5:      STAFF,
Line 6:      DRIVER,
Line 7:      MANAGER,
Line 8:      ASSISTANT_MANAGER,
Line 9:      KIOSK  // Kiosk terminal accounts for POS auto-login
Line 10: }
```

#### Enterprise Governance Vacuum:
The system provides only store-level roles (`STAFF`, `DRIVER`, `MANAGER`, `ASSISTANT_MANAGER`, `KIOSK`) and a single public role (`CUSTOMER`).
* **Missing HQ Roles:** No `ENTERPRISE_ADMIN`, `EXECUTIVE`, `REGIONAL_DIRECTOR`, `AREA_COACH`, `AUDITOR`, `DPO` (Data Protection Officer), `CHIEF_ACCOUNTANT`, or `LEGAL_COUNSEL`.
* **Cross-Store Impossibility:** Because `MANAGER` is the highest role in the system, any centralized dashboard or headquarters tool must either:
  a) Authenticate with a fake store-level manager account (violating least-privilege), or
  b) Completely bypass authorization filters, opening catastrophic security holes.
* **No Franchisee Segregation:** A multi-unit franchisee owning 10 stores cannot grant a regional supervisor access to only those 10 stores. The permission model is binary: single-store staff or global super-admin bypass.

---

### 4. Comprehensive Inventory of Tenant Identity Entry Points

| Surface Layer | Identity Ingestion Point | Implementation Mechanism | Security & Isolation Evaluation |
| :--- | :--- | :--- | :--- |
| **HTTP Request Headers** | `X-Store-Id`, `X-User-Id`, `X-User-Type` | Injected by `api-gateway/src/main/java/com/MaSoVa/gateway/filter/JwtAuthenticationFilter.java` from verified JWT claims. | **HIGH**: Strong at the gateway boundary when downstream services exclusively trust these headers. |
| **HTTP Request Parameters** | `@RequestParam(required=false) String storeId` | Present across controllers (`DeliveryController.java:L89`, `PaymentController.java:L133`, `OrderController.java:L151`). | **CRITICAL FLAW**: Directly overrides JWT header identity in multiple controllers, enabling trivial cross-tenant data access. |
| **HTTP Request Path** | `@PathVariable String storeId` | Used in `/api/stores/{storeId}`, `/api/menu/store/{storeId}`. | **MEDIUM**: Read-only public endpoints are acceptable; mutations without ownership checks are hazardous. |
| **JWT Claims** | `storeId`, `sub`, `roles`, `userType` | Encoded in RSA/HMAC signed JWT during authentication in `core-service`. | **MEDIUM**: JWT contains single `storeId`. Multi-store managers cannot hold multi-tenant scopes in a single token. |
| **MongoDB Documents** | Field `storeId: String` | Document attribute in `orders`, `stores`, `menu_items`, `inventory`, `deliveries`. | **PARTIAL**: Present in most documents, but completely missing from `DriverLocation.java:L24-38`. No database-level tenant isolation. |
| **PostgreSQL Tables** | Column `store_id VARCHAR(50)` | Relational column in `commerce_schema.orders`, `core_schema.stores`, `logistics_schema.delivery_trackings`. | **CRITICAL FLAW**: PostgreSQL Row-Level Security (RLS) is **NOT** enabled anywhere. Any connection to PostgreSQL can query across all stores. |
| **RabbitMQ Events** | JSON field `storeId` inside event payloads | Broadcast via `MaSoVaRabbitMQConfig.ORDERS_EXCHANGE`. | **CRITICAL FLAW**: Single unpartitioned exchange and shared queues. Every consumer sees events from all 100 stores; no vhost or tenant topic isolation. |
| **WebSockets (STOMP)** | Path `/topic/kitchen/{storeId}` | Subscribed to by frontend KDS and staff displays. | **CRITICAL FLAW**: Zero subscription authorization. Any authenticated staff member can subscribe to `/topic/kitchen/DOM002` and view live kitchen queues. |
| **Redis Caching** | Key pattern `store:{storeId}:*` | Cache keys in `core-service` and `commerce-service`. | **LOW/MEDIUM**: Keys are prefixed by storeId, but stored in a single shared Redis keyspace without ACL isolation. |
| **Background Jobs** | Scheduled Quartz / Spring tasks | Cron tasks in `OrderCleanupTask`, `AnalyticsAggregationTask`. | **HIGH FLAW**: Scheduled tasks iterate through database collections globally without tenant context, risking cross-store data bleed. |
| **AI Support Agent** | LLM Tools in `masova-support` | Python FastAPI tools in `backend_tools.py`. | **HIGH FLAW**: Agent runs with caller token, but tools accept raw `store_id` parameters and lack cross-store boundaries for order queries. |
| **Fleet / Logistics** | `DriverLocation.java` & Driver App | Driver location tracking endpoint `POST /api/delivery/driver/location`. | **CRITICAL FLAW**: Collection `driver_locations` contains no `storeId` or `countryCode`. Global unpartitioned GPS data pool. |

---

### 5. Architectural Failure: Absence of Multi-Tenancy Enforcement

True enterprise multi-tenancy requires enforcement at three distinct tiers:
1. **Logical Tier (Application Layer):** Automated contextual tenant scoping (e.g. ThreadLocal or reactive context) enforced via framework interceptors or AOP, where developers cannot forget to append `WHERE store_id = :storeId`.
   * *Status in MaSoVa:* Manual and brittle. Developers manually write queries like `findByStoreId(...)`. Where forgotten (e.g. `OrderController.java:L164-166` for order numbers, or `PATCH /api/orders/{id}`), cross-tenant leakage occurs immediately.
2. **Data Tier (Database Layer):** Database-enforced partitioning (PostgreSQL Row-Level Security, separate schemas per country/entity, or sharded MongoDB tenant keys).
   * *Status in MaSoVa:* Completely absent. PostgreSQL runs a single shared database (`masova_dev`) where tables are shared across all 100 stores with zero RLS policies. MongoDB runs shared collections with basic single-field indexing.
3. **Infrastructure Tier (Network & Messaging Layer):** Tenant-aware event queues, dedicated virtual hosts, and segregated Redis namespaces.
   * *Status in MaSoVa:* Completely absent. All 100 stores share a single RabbitMQ broker, a single Redis cluster, and a single MongoDB cluster.

---

### 6. CTO Verdict on Tenant Model

The current tenant model is a **flat single-tier prototype** hardcoded to Domino's mock conventions (`DOM001`-`DOM999`). It cannot represent an enterprise holding company, multiple European legal entities, national jurisdictions, or distinct restaurant brands.

**Multi-Tenancy Readiness: NON-EXISTENT / BLOCKED**
