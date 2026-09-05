# 09 - Multi-Tenancy Red Team & Store Isolation Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Multi-Tenancy Architecture Overview

In the MaSoVa restaurant ecosystem, multi-tenancy is structured around restaurant branches (`storeId`). All microservices share common databases (MongoDB databases `masova_commerce`, `masova_core`, `masova_logistics`, `masova_payment`), meaning tenant isolation relies entirely on application-level row/document filtering and security context validation (`StoreContextUtil`).

---

## 2. Critical Multi-Tenancy Isolation Vulnerabilities

### 2.1 Critical Vulnerability 1: Mutating Order Operations Completely Omit Store Access Checks (Cross-Store Hijacking)
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java`
* **Symbols:** `updateOrderStatus`, `nextStage`, `updateOrder`, `cancelOrder`
* **Lines:** 205–212, 217–222, 236–245, 307–315
* **Implementation Trace:**
  * In `OrderController.java:L128`, the read endpoint `getOrder(@PathVariable String orderId)` explicitly calls:
    ```java
    enforceStaffStoreAccess(order, request);
    ```
  * However, examine every single write and mutation endpoint:
    ```java
    // L205-212: State machine status transition
    @PostMapping("/{orderId}/status")
    @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF', 'DRIVER')")
    public ResponseEntity<Order> updateOrderStatus(
            @PathVariable String orderId,
            @Valid @RequestBody UpdateOrderStatusRequest request) {
        return ResponseEntity.ok(orderService.updateOrderStatus(orderId, request));
    }

    // L217-222: Kitchen next-stage bump
    @PostMapping("/{orderId}/next-stage")
    @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
    public ResponseEntity<Order> nextStage(@PathVariable String orderId) {
        return ResponseEntity.ok(orderService.moveOrderToNextStage(orderId));
    }

    // L236-245: Patch order items, driver, priority
    @PatchMapping("/{orderId}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
    public ResponseEntity<Order> updateOrder(...) { ... }

    // L307-315: Cancel order
    @DeleteMapping("/{orderId}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
    public ResponseEntity<Void> cancelOrder(...) { ... }
    ```
* **Exploit Analysis:**
  * `enforceStaffStoreAccess()` is **never invoked** on any mutating endpoint.
  * A staff member or assistant manager belonging to Store A (`store-001`) who obtains an `orderId` belonging to Store B (`store-002`) can invoke `POST /api/orders/{orderId}/status`, `POST /api/orders/{orderId}/next-stage`, or `DELETE /api/orders/{orderId}`.
  * The backend executes the status change, cancels the order, or alters the items without verifying that the authenticated caller is assigned to the store where the order was placed.
  * **Consequence:** Total cross-tenant write authorization failure across all restaurant branches.

---

### 2.2 Critical Vulnerability 2: Null Store ID Bypass in `enforceStaffStoreAccess`
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java`
* **Symbol:** `enforceStaffStoreAccess`
* **Lines:** 93–104
* **Implementation:**
  ```java
  private void enforceStaffStoreAccess(Order order, HttpServletRequest request) {
      String userType = StoreContextUtil.getUserTypeFromHeaders(request);
      if (!StoreAccessValidator.requiresStoreMembershipValidation(userType)) {
          return;
      }
      String storeId = getStoreIdFromHeaders(request);
      if (storeId != null && order.getStoreId() != null && !storeId.equals(order.getStoreId())) {
          log.warn("Cross-store order access: userType={}, userStore={}, orderStore={}",
                  userType, storeId, order.getStoreId());
          throw new AccessDeniedException("Cannot access order from different store");
      }
  }
  ```
* **Vulnerability Analysis:**
  * The tenant check requires `storeId != null`.
  * If a request reaches `commerce-service` without the `X-Selected-Store-Id` header (for example, by directly calling the exposed port `8084` or stripping the header), `getStoreIdFromHeaders(request)` returns `null`.
  * Because `storeId` is `null`, the condition `storeId != null && ...` evaluates to `false`.
  * The check silently exits without throwing `AccessDeniedException`.
  * **Consequence:** Any authenticated staff user can bypass store isolation simply by omitting the `X-Selected-Store-Id` header from their request.

---

### 2.3 Critical Vulnerability 3: Public Unauthenticated Order Tracking Information Leakage
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java`
* **Symbol:** `trackOrder`
* **Lines:** 135–140
* **Implementation:**
  ```java
  @GetMapping("/track/{orderId}")
  @Operation(summary = "Track order (public, no auth)")
  public ResponseEntity<OrderTrackingDTO> trackOrder(@PathVariable String orderId) {
      return ResponseEntity.ok(
              OrderTrackingDTO.fromOrder(orderService.getOrderById(orderId)));
  }
  ```
* **Analysis:**
  * While `OrderTrackingDTO.java:L12` redacts customer name and phone, `OrderService.getOrderById(orderId)` loads the complete order.
  * The endpoint is public with zero authentication and zero rate limiting.
  * If order IDs are enumerable or leaked via logs, anyone on the internet can poll every active order across all restaurant locations, tracking preparation status, delivery timestamps, and items ordered.

