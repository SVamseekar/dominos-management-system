# MSB-004: European Production Go-Live Certification Challenge
## Document 02: Trust Boundaries, Network Security & Access Control

**Date of Review:** September 4, 2026
**Benchmark Identity:** MSB-004 — Tests 4 & 5
**Category:** Security Architecture, Trust Boundaries, Authorization, Header Forgery
**Mode:** READ-ONLY Forensic Audit

---

### 1. The Perceived vs. Actual Trust Boundary

The engineering documentation asserts that `api-gateway` acts as the single secure entry point, authenticating incoming requests with JWT, validating store tenancy, stripping forged internal headers, and routing traffic to downstream services.

Source code audit proves that the **actual trust boundary is fundamentally broken**.

```
PERCEIVED TRUST BOUNDARY:
[Client] ---> (TLS / Auth) ---> [API Gateway (8080)] ---> [Internal Private Network (No direct access)]
                                  - JWT Validation            - core-service (8085)
                                  - Header Stripping          - commerce-service (8084)
                                  - Rate Limiting             - payment-service (8089)

ACTUAL TRUST BOUNDARY (FORENSIC REALITY):
                                +-----------------------------------+
                                |          PUBLIC INTERNET          |
                                +-----------------------------------+
                                      |                       |
                 (Intended Route)     |                       |  (DIRECT BYPASS ROUTE)
                                      v                       v
                           [API Gateway: 8080]        [Direct Port: 8084]
                           - Strips X-Internal-Svc    - NO Gateway Filter
                           - Validates User JWT       - NO Header Stripping
                                      |               - Public endpoint: /api/orders/*/payment
                                      v                       |
                         [commerce-service: 8084] <-----------+
                         Checks httpRequest.getHeader("X-Internal-Service")
                         Attacker sets: "X-Internal-Service: payment-service"
                         RESULT: Order marked PAID without payment! [CRITICAL]
```

---

### 2. Forensic Proof of Direct Gateway Bypass & Payment Forgery

#### 2.1 The Vulnerability Mechanism
In `commerce-service/src/main/java/com/MaSoVa/commerce/config/SecurityConfig.java:50-52`:
```java
// Payment status callback from payment-service
"/api/orders/*/payment",
```
This endpoint is explicitly declared in `getPublicEndpoints()`, which configures Spring Security to execute `permitAll()` without requiring any JWT token or authentication principal.

In `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:377-396`:
```java
@PatchMapping("/{orderId}/payment")
@Operation(summary = "Update payment status (inter-service or MANAGER/STAFF)")
public ResponseEntity<Order> updatePaymentStatus(
        @PathVariable String orderId,
        @Valid @RequestBody UpdatePaymentStatusRequest request,
        jakarta.servlet.http.HttpServletRequest httpRequest) {
    String internalCaller = httpRequest.getHeader("X-Internal-Service");
    if (internalCaller == null || internalCaller.isBlank()) {
        // Not an internal call — require MANAGER/ASSISTANT_MANAGER/STAFF role
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        boolean hasRole = auth != null && auth.getAuthorities().stream().anyMatch(a ->
                a.getAuthority().equals("ROLE_MANAGER") ||
                a.getAuthority().equals("ROLE_ASSISTANT_MANAGER") ||
                a.getAuthority().equals("ROLE_STAFF"));
        if (!hasRole) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).build();
        }
    }
    return ResponseEntity.ok(orderService.updatePaymentStatus(orderId, request.getStatus(), request.getTransactionId()));
}
```

#### 2.2 The Exploit Vector
1. `api-gateway/src/main/java/com/MaSoVa/gateway/config/GatewayConfig.java:299` contains `.removeRequestHeader("X-Internal-Service")`. The developers assumed that external callers could not inject `X-Internal-Service`.
2. However, in `docker-compose.yml:118-119`, port 8084 is mapped directly to `0.0.0.0:8084`.
3. In `.github/workflows/deploy.yml:90`, `commerce-service` is deployed to Cloud Run with `--allow-unauthenticated`.
4. An external attacker sends the following HTTP request directly to `http://<host>:8084/api/orders/ORD-100293/payment` (or `https://commerce-service-masova-app.run.app/api/orders/ORD-100293/payment`):

```http
PATCH /api/orders/ORD-100293/payment HTTP/1.1
Host: commerce-service:8084
X-Internal-Service: payment-service
Content-Type: application/json

{
  "status": "PAID",
  "transactionId": "forged_free_food_tx_99999"
}
```
5. **Execution trace:**
   - Spring Security passes the request because `/api/orders/*/payment` is public (`permitAll()`).
   - `httpRequest.getHeader("X-Internal-Service")` returns `"payment-service"`.
   - The condition `internalCaller == null || internalCaller.isBlank()` evaluates to `false`.
   - The role check is completely bypassed.
   - `orderService.updatePaymentStatus()` executes, changes order status to `PAID`, triggers kitchen display ticket generation, and alerts staff to prepare the food.
   - **Cost to attacker:** €0.00. **Financial loss to restaurant:** 100% of order value.

---

### 3. Missing Cryptographic Service Identity (No mTLS)

Across all six Java backend services and the Python AI agent:
1. **Cleartext Inter-Service Calls:** All inter-service REST calls use plain `http://` URLs (e.g., `http://masova-core:8085`, `http://masova-commerce:8084` in `docker-compose.yml:136, 226, 289-293`).
2. **Absence of Mutual TLS (mTLS):** No service presents an X.509 client certificate to authenticate its identity to peer services.
3. **Absence of Service-to-Service Tokens:** There is no internal service token issuer (e.g., OAuth2 client credentials, SPIFFE/SPIRE, or private asymmetric JWTs).
4. **Header-Based Trust Vulnerability:** Downstream microservices trust arbitrary HTTP headers (`X-Internal-Service`, `X-User-Id`, `X-User-Type`, `X-User-Store-Id`) without cryptographic signatures or HMAC verification. Any entity capable of reaching the internal HTTP port can impersonate any user, role, store, or service.

---

### 4. Role-Based Access Control (RBAC) & Privilege Analysis

The platform defines the following actor roles in `com.MaSoVa.shared.security.util.JwtTokenProvider` and controllers:

```
+----------------------------------------------------------------------------------------------------+
|                                    SECURITY ACTOR ROLE MATRIX                                      |
+----------------------------------------------------------------------------------------------------+
| Role                 | Authority Claim     | Scope & Constraints                                   |
+----------------------+---------------------+-------------------------------------------------------+
| CUSTOMER             | ROLE_CUSTOMER       | Restricted to own orders (order.customerId match);    |
|                      |                     | exempt from storeId JWT claim requirement.            |
| STAFF                | ROLE_STAFF          | Tied to single storeId; POS order entry, preparation. |
| ASSISTANT_MANAGER    | ROLE_ASSISTANT_MGR  | Tied to single storeId; operational shift supervision.|
| MANAGER              | ROLE_MANAGER        | Tied to single storeId; refunds, inventory, payroll.  |
| DRIVER               | ROLE_DRIVER         | Bound to logistics delivery tracking; status updates. |
| KIOSK                | ROLE_KIOSK          | Bound to single storeId; unauthenticated menu/order.  |
| AGENT                | Forwarded Customer  | masova-support conversational customer support agent. |
+----------------------------------------------------------------------------------------------------+
```

#### 4.1 AI Support Agent Privilege Escalation Risk
In `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:83-88`:
```java
/**
 * CUSTOMER callers are bound to order.customerId (Tasks 6–7). "AGENT" is also accepted
 * here for forward-compatibility with an X-User-Type: AGENT caller, but no such caller
 * exists today — masova-support currently authenticates as MANAGER (see backend_tools.py),
 * which is exempt from this binding and relies on its own @PreAuthorize role check instead.
 */
```
While recent refactoring in `masova-support/src/masova_agent/auth.py` binds customer-facing chat to forwarded customer JWT tokens, the backend controller comments and ops endpoints reveal that the AI infrastructure was originally designed to authenticate with elevated `MANAGER` credentials.

In `masova-support/src/masova_agent/auth.py:112-126`, internal ops trigger endpoints (`/agents/{name}/trigger`) bypass customer token verification using a static header `X-Agent-Api-Key`. If this key is compromised, automated agents can trigger dynamic pricing modifications, shift generation, and inventory reorders without human oversight.

#### 4.2 Customer Store Switching & Multi-Tenancy Boundary
In `shared-models/src/main/java/com/MaSoVa/shared/util/StoreAccessValidator.java:35-42`:
```java
public static boolean isSelectedStoreAllowed(String userType, String jwtStoreId, String selectedStoreId) {
    if (selectedStoreId == null || selectedStoreId.isBlank()) {
        return true;
    }
    if (!requiresStoreMembershipValidation(userType)) {
        // CUSTOMER / AGENT — store selection is not JWT-bound here (service-level checks apply elsewhere)
        return true;
    }
    if (jwtStoreId == null || jwtStoreId.isBlank()) {
        return false;
    }
    return jwtStoreId.equals(selectedStoreId);
}
```
For `CUSTOMER` roles, `requiresStoreMembershipValidation()` returns `false`. This allows customers to set arbitrary `X-Selected-Store-Id` headers. While customers legitimately purchase from different stores, query endpoints must strictly enforce that queries are isolated to the targeted store without leaking cross-store operational data.

In `intelligence-service/src/main/java/com/MaSoVa/intelligence/service/BIEngineService.java:178-185`:
```java
List<Map<String, Object>> allCustomers = customerServiceClient.getAllCustomers();
List<Map<String, Object>> orders = orderServiceClient.getOrdersByDateRange(
    LocalDateTime.of(today.minusMonths(6), LocalTime.MIN),
    LocalDateTime.of(today, LocalTime.MAX)
);
```
When `predictChurn(storeId)` is called for a single store, it executes un-scoped, global HTTP queries fetching **every customer across all stores** and **every order across all stores** in the entire multi-tenant platform. This violates cross-tenant isolation principles, exposing multi-franchise customer data across store boundaries in memory.

---

### 5. Summary of Identified Security Vulnerabilities

| Finding ID | Vulnerability Classification                   |        CWE        |   Severity   | Impact                                                                             |
| :--------- | :--------------------------------------------- | :---------------: | :----------: | :--------------------------------------------------------------------------------- |
| **SEC-01** | Direct Service Port Exposure & Gateway Bypass  |     CWE-1385      | **CRITICAL** | All internal microservices reachable directly on host ports `8084-8089`.           |
| **SEC-02** | Unauthenticated Payment State Modification     | CWE-287 / CWE-306 | **CRITICAL** | Direct callers spoof `X-Internal-Service: payment-service` to mark orders PAID.    |
| **SEC-03** | Missing In-Transit Encryption (Plaintext HTTP) |      CWE-319      |   **HIGH**   | Inter-service network traffic is cleartext; vulnerable to packet inspection.       |
| **SEC-04** | Missing Mutual Authentication (No mTLS)        |      CWE-306      |   **HIGH**   | Downstream services trust caller-asserted headers without cryptographic proof.     |
| **SEC-05** | Actuator Information Disclosure                |      CWE-200      |  **MEDIUM**  | Gateway exposes `/actuator/routes` and `/actuator/gateway` without authentication. |
| **SEC-06** | Excessive Rate Limit Thresholds                |      CWE-770      |  **MEDIUM**  | Gateway configures 1,000 req/min for auth login endpoints, permitting brute force. |
| **SEC-07** | Cross-Tenant Memory Exposure in Analytics      |      CWE-200      |   **HIGH**   | BIEngineService loads global platform customer/order records for single-store BI.  |

---

### 6. Security Verdict for Tests 4 & 5: FAIL

**Finding:** The trust boundary cannot withstand hostile attack. The direct port exposure combined with the unauthenticated `X-Internal-Service` bypass in `OrderController.java` represents an immediate, zero-cost exploit that allows any network actor to steal unlimited food from the platform without paying.

