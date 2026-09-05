# 10 - Cross-Ecosystem Authorization & Security Context Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Summary

Authorization across the MaSoVa ecosystem is founded on JSON Web Tokens (JWT) issued by `core-service`, authenticated and rewritten into downstream headers by `api-gateway`, and interpreted by Spring Security in downstream microservices. An exhaustive cross-system audit reveals critical structural flaws: fail-open blacklist verification, role naming mismatches that lock customers out of intended capabilities, and trust boundary leakage between client and internal assertions.

---

## 2. JWT Architecture & Token Generation

### 2.1 Token Issuance
* **Component:** `SVamseekar/masova-platform` (`core-service`)
* **File:** `core-service/src/main/java/com/MaSoVa/core/user/service/JwtService.java`
* **Symbol:** `generateAccessToken`
* **Lines:** 102–109
* **Code Trace:**
  ```java
  // Add roles claim based on userType
  // Note: Do NOT add "ROLE_" prefix here - JwtAuthenticationFilter will add it
  List<String> roles = new ArrayList<>();
  roles.add(userType);
  claims.put("roles", roles);

  return createToken(claims, userId, accessTokenExpiration);
  ```
* **Claims Payload Structure:**
  * `sub`: User ID
  * `userType`: E.g. `CUSTOMER`, `STAFF`, `DRIVER`, `MANAGER`, `KIOSK`
  * `storeId`: String identifier of assigned store (null for customers)
  * `roles`: Array `["CUSTOMER"]`

---

## 3. Vulnerability Findings

### 3.1 Finding 1: Revocation Blacklist Fails Open on Redis Outage or Omission
* **Component:** `SVamseekar/masova-platform` (`shared-security`)
* **File:** `shared-security/src/main/java/com/MaSoVa/shared/security/filter/JwtAuthenticationFilter.java`
* **Symbol:** `isBlacklisted`
* **Lines:** 83–90
* **Verbatim Implementation:**
  ```java
  private boolean isBlacklisted(String token) {
      if (redisTemplate == null) return false; // fail-open if Redis not wired in this service
      try {
          return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + token));
      } catch (Exception e) {
          return false; // fail-open: don't lock users out if Redis is down
      }
  }
  ```
* **Security Evaluation:**
  * If a microservice fails to inject `redisTemplate` or is missing the Redis dependency, `isBlacklisted` returns `false` unconditionally.
  * If Redis experiences downtime, network partition, or connection saturation, the catch block catches the exception and returns `false`.
  * **Consequence:** An employee who has been terminated, whose password was changed, or whose JWT was explicitly revoked during logout can continue to perform authenticated actions against downstream services whenever Redis hiccups or fails. Revocation guarantees are non-existent under partition.

---

### 3.2 Finding 2: Authorization Lockout on Customer Order Cancellation
* **Component:** `SVamseekar/masova-platform` (`commerce-service`) vs `SVamseekar/masova-mobile`
* **Backend File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L307-310`
* **Mobile File:** `masova-mobile/src/services/orderApi.ts:L58-61`
* **Analysis:**
  * The customer mobile app executes:
    ```typescript
    cancelOrder: builder.mutation<Order, string>({
      query: (orderId) => ({
        url: `/orders/${orderId}`,
        method: 'DELETE',
      }),
    })
    ```
  * In `OrderController.java`, the endpoint is guarded:
    ```java
    @DeleteMapping("/{orderId}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
    public ResponseEntity<Void> cancelOrder(...)
    ```
  * The customer's JWT yields authority `ROLE_CUSTOMER`.
  * When the customer triggers cancellation, Spring Security's `MethodSecurityInterceptor` evaluates `hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')` -> `false`.
  * **Consequence:** The API Gateway forwards an HTTP 403 Forbidden error to the mobile client. Customer order cancellation is permanently non-functional.

---

### 3.3 Finding 3: Ambiguity Between `userType` and `roles` in Client Navigation Routing
* **Component:** `SVamseekar/MaSoVaCrewApp`
* **File:** `src/navigation/AppNavigator.tsx`
* **Symbol:** `RoleRouter`
* **Lines:** 18–25
* **Implementation:**
  ```typescript
  const user = useSelector(selectCurrentUser);
  const type = user?.type?.toUpperCase() ?? '';

  if (type === 'DRIVER') return <DriverTabNavigator />;
  if (type === 'KITCHEN_STAFF' || type === 'STAFF') return <KitchenTabNavigator />;
  if (type === 'CASHIER' || type === 'KIOSK') return <CashierTabNavigator />;
  if (type === 'MANAGER' || type === 'ASSISTANT_MANAGER') return <ManagerTabNavigator />;
  ```
* **Analysis:**
  * The driver app inspects `user.type`.
  * However, backend `UserResponse` DTOs historically serialized both `type` and `role`.
  * If a user has `type: "EMPLOYEE"` and `role: "DRIVER"`, `user?.type?.toUpperCase()` evaluates to `"EMPLOYEE"`, missing the driver check and falling into `StaffTabNavigator` (line 27), completely locking the driver out of the driver dispatch interface.

