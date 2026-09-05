# 06 — Test 6: Staff Roles, Permissions, & Perimeter Security Audit

**Benchmark:** MSB-002
**Title:** European Single-Restaurant Operational Readiness
**Perspective:** Internal Security & Role-Based Access Control (RBAC) Assessment
**Standard of Evidence:** Strict source-code citations (`Repository`, `File`, `Symbol`, `Line`)
**Status Tags:** `[VERIFIED FROM SOURCE]`, `[STRONGLY INFERRED]`, `[REQUIRES RUNTIME VALIDATION]`, `[REQUIRES LEGAL/TAX REVIEW]`

---

## 1. Authentication & Token Architecture

* **Authentication Protocol:** JSON Web Tokens (JWT) signed with HMAC-SHA512 (`shared-security/.../JwtTokenProvider.java`).
* **Claims Carried:** `sub` (userId), `userType` (role), `storeId` (assigned restaurant), `email`.
* **Perimeter Gateway Extraction:**
  * `api-gateway/.../JwtAuthenticationFilter.java:L101-149`:
    * Validates JWT signature and expiry.
    * Injects extracted claims into downstream HTTP headers: `X-User-Id`, `X-User-Type`, `X-User-Store-Id`.
    * Validates that staff cannot supply an arbitrary `X-Selected-Store-Id` outside their assigned `storeId` (`L133-142`).
* **Service-Level Enforcement:**
  * Each microservice runs `shared-security/.../JwtAuthenticationFilter.java:L35-73`.
  * Roles are mapped to Spring Security authorities prefixed with `ROLE_` (e.g., `ROLE_MANAGER`, `ROLE_STAFF`).
  * Endpoints are protected via `@PreAuthorize("hasRole(...)")` and `SecurityConfig.java`.

---

## 2. Perspective Analysis: What Can Each Role Actually Do?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PERMISSION MATRIX                              │
├───────────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│ Operation         │ Owner/Mgr    │ Cashier      │ Kitchen      │ Driver     │
├───────────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ View Menu         │ Full         │ Full         │ Full         │ Full       │
│ Create Order      │ ✅ Allowed   │ ✅ Allowed   │ ✅ Allowed   │ ❌ Blocked │
│ Advance KDS Stage │ ✅ Allowed   │ ✅ Allowed   │ ✅ Allowed   │ ❌ Blocked │
│ Cross-Store Status│ ⚠️ Vulnerable│ ⚠️ Vulnerable│ ⚠️ Vulnerable│ ⚠️ Vulnerable
│ Issue Instant Ref.│ ✅ Allowed   │ ❌ Request   │ ❌ Request   │ ❌ Blocked │
│ Approve Ref. Req. │ ✅ Allowed   │ ❌ Blocked   │ ❌ Blocked   │ ❌ Blocked │
│ Cancel Active Ord.│ ✅ Allowed   │ ✅ Allowed   │ ✅ Allowed   │ ❌ Blocked │
│ Mark Delivered    │ ✅ Allowed   │ ✅ Allowed   │ ✅ Allowed   │ ❌ Blocked │
│ Manage Employees  │ ✅ Allowed   │ ❌ Blocked   │ ❌ Blocked   │ ❌ Blocked │
│ View Store Stats  │ ✅ Allowed   │ ❌ Blocked   │ ❌ Blocked   │ ❌ Blocked │
└───────────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

### 1. Restaurant Owner / General Manager (`ROLE_MANAGER`)
* **Declared Scope:** Complete administrative oversight of the restaurant branch.
* **Actual Code Capabilities:**
  * Can create stores (`StoreController.java:L91`), update store configuration, and adjust opening hours.
  * Can register and provision employees (`UserController.java:L50`).
  * Can declare menu items and statutory allergens (`MenuController.java:L182`).
  * Can immediately execute refunds (`RefundController.java:L48`) and approve pending refunds (`L84`).
  * Can directly cancel orders (`OrderController.java:L308`) and approve cancellation requests (`L349`).
* **Security Limitation:** The system models multi-branch networks, but there is no distinct `OWNER` or `SUPERADMIN` role separate from `MANAGER`. A store manager has identical permissions to the ultimate restaurant owner.

---

### 2. Cashier (`ROLE_STAFF`)
* **Declared Scope:** POS counter ordering, accepting cash payments, viewing menu availability.
* **Actual Code Capabilities:**
  * Can create orders (`OrderController.java:L109`).
  * Can update payment status to `PAID` for cash orders (`OrderController.java:L385-390`).
  * Can request refunds on behalf of customers (`RefundController.java:L64`), but cannot approve them.
  * **Privilege Over-Reach:** Because cashiers share the generic `ROLE_STAFF` with kitchen workers:
    * Cashiers can bump kitchen display stages (`POST /api/orders/{id}/next-stage`).
    * Cashiers can unilaterally cancel active orders (`DELETE /api/orders/{id}`) under `OrderController.java:L308` without manager approval.
    * Cashiers can mark orders as delivered with proof (`PATCH /api/orders/{id}`).

---

### 3. Kitchen Worker / Chef (`ROLE_STAFF`)
* **Declared Scope:** View kitchen tickets on the KDS and advance dishes through preparation stages.
* **Actual Code Capabilities:**
  * Can query kitchen queue (`GET /api/orders/kitchen?storeId=...`).
  * Can bump orders to `PREPARING`, `BAKED`, and `DISPATCHED` (`POST /api/orders/{id}/next-stage`).
  * Can record quality checkpoints (`OrderController.java:L400-418`).
* **Privilege Over-Reach:**
  * Because there is no granular `ROLE_KITCHEN`, kitchen workers possess the exact same token rights as cashiers: they can create orders, accept cash, cancel orders, and request refunds.

---

### 4. Driver (`ROLE_DRIVER`)
* **Declared Scope:** View assigned deliveries, navigate routes, collect food, and submit proof of delivery (POD).
* **Actual Code Capabilities:**
  * In `OrderController.java:L206,L237`, drivers are authorized to update order status and update delivery proof fields (`PATCH /api/orders/{id}`).
* **Operational Paralysis:**
  * In the mobile app (`MaSoVaCrewApp`), drivers are completely non-functional because the app calls obsolete endpoints (`GET /orders/status/{status}` and `PATCH /orders/{id}/status`), receiving HTTP 404 and 405.
  * Drivers cannot query active delivery runs or submit proof of delivery through their dedicated application.

---

## 3. Five Critical Architectural Security Holes

### 1. Perimeter Bypass via Docker Host Port Publishing
* **Severity:** **CRITICAL** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `docker-compose.yml:L78-79, L118-119, L158-159, L200-201, L240-241`
* **Mechanics:**
  In `docker-compose.yml`, every single backend microservice publishes its port directly to the host network:
  * `core-service`: `8085:8085`
  * `commerce-service`: `8084:8084`
  * `payment-service`: `8089:8089`
  * `logistics-service`: `8086:8086`
  * `intelligence-service`: `8087:8087`
  Only `api-gateway` (port `8080`) strips suspicious headers and enforces edge rate limiting. Because the backend ports are directly exposed on the host, any client connected to the restaurant's local network (e.g. staff terminal, rogue device, compromised IoT device, or visitor on restaurant Wi-Fi) can send HTTP requests directly to `http://<server-ip>:8084`, completely bypassing `api-gateway`.

---

### 2. Unauthenticated Payment Bypass via Spoofed Internal Headers
* **Severity:** **CRITICAL** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `commerce-service/.../SecurityConfig.java:L51`
  * `commerce-service/.../OrderController.java:L383-395`
* **Mechanics:**
  1. In `SecurityConfig.java:L51`, `/api/orders/*/payment` is included in `getPublicEndpoints()`, bypassing Spring Security JWT token validation.
  2. In `OrderController.java:L383-395`:
     ```java
     String internalCaller = httpRequest.getHeader("X-Internal-Service");
     if (internalCaller == null || internalCaller.isBlank()) {
         // Perform role check for MANAGER / STAFF
     }
     return ResponseEntity.ok(orderService.updatePaymentStatus(orderId, request.getStatus(), request.getTransactionId()));
     ```
  3. If an attacker connects directly to port `8084` and sets `X-Internal-Service: payment-service` (or any non-blank string), `OrderController` bypasses all authentication.
  4. The attacker can mark any order as `PAID` with a fake transaction ID without paying a single cent.

---

### 3. Cross-Store Mutating Operations (Broken Tenant Isolation)
* **Severity:** **HIGH** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `commerce-service/.../OrderController.java:L205-212, L217-222, L236-250`
  * `commerce-service/.../OrderService.java:L447-478, L513-548`
* **Mechanics:**
  While `OrderController.enforceStaffStoreAccess()` (`L97-104`) validates that staff cannot read orders belonging to another store via `GET /api/orders/{id}`, **mutating endpoints do not perform this check**:
  * `POST /api/orders/{id}/status`
  * `POST /api/orders/{id}/next-stage`
  * `PATCH /api/orders/{id}`
  A cashier or driver possessing a valid JWT for Store A (`DOM001`) can send requests targeting orders at Store B (`DOM002`) and advance their stage, assign drivers, or change delivery details.

---

### 4. Insecure Token Revocation (Fail-Open Redis Blacklist)
* **Severity:** **HIGH** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `shared-security/.../JwtAuthenticationFilter.java:L83-90`
* **Mechanics:**
  ```java
  private boolean isBlacklisted(String token) {
      if (redisTemplate == null) return false;
      try {
          return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + token));
      } catch (Exception e) {
          return false; // fail-open: don't lock users out if Redis is down
      }
  }
  ```
  If Redis is down or experiencing network partitions, the token blacklist fails open. A terminated employee whose token was revoked during dismissal can continue making authorized API calls until the token's natural expiry.

---

### 5. Overly Broad Public Endpoints in Commerce Service
* **Severity:** **MEDIUM** `[VERIFIED FROM SOURCE]`
* **Code Trace:**
  * `commerce-service/.../SecurityConfig.java:L27-52`
* **Mechanics:**
  `SecurityConfig.java` permits unauthenticated access to broad path wildcards:
  * `/api/menu/items/**`
  * `/api/orders/track/**`
  * `/api/orders/rating-token/**`
  * `/api/orders/*/payment`
  Because these paths bypass Spring Security, endpoint controllers must manually enforce authorization checks. Where controllers rely on simple header checks (`X-Internal-Service`), severe authorization bypasses emerge.

---

## 4. Internal Security Scorecard

| Security Criterion                |   Status   | Technical Finding                                              |
| :-------------------------------- | :--------: | :------------------------------------------------------------- |
| **Edge Gateway Authentication**   |  ✅ STRONG  | Validates HS512 signatures and asserts store context.          |
| **Service Perimeter Isolation**   | ❌ CRITICAL | Host ports published directly; gateway bypassed from LAN.      |
| **Internal Service Trust**        | ❌ CRITICAL | Unsigned `X-Internal-Service` headers accepted on blind trust. |
| **Cross-Store Isolation (Read)**  |  ✅ STRONG  | `enforceStaffStoreAccess` blocks cross-store reads.            |
| **Cross-Store Isolation (Write)** |  ❌ BROKEN  | Status updates and stage bumps omit store ownership check.     |
| **Role Granularity**              |   ⚠️ POOR   | Cashiers and kitchen staff share single `ROLE_STAFF`.          |
| **Token Invalidation**            |   ⚠️ WEAK   | Revocation blacklist fails open if Redis is unavailable.       |

**Audit Recommendation:** **DO NOT DEPLOY WITHOUT NETWORK REMEDIATION.** At a minimum, remove port bindings `8084`, `8085`, `8086`, and `8089` from `docker-compose.yml`, enforce internal service shared HMAC signatures, and add store ownership validation to all order mutation endpoints.

