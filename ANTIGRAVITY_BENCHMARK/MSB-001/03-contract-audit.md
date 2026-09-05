# 03 - Cross-Repository Contract Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Summary of Contract Integrity

A distributed system requires strict contract synchronization between client applications, external agents, and backend microservices. An exhaustive cross-repository audit between `SVamseekar/masova-platform`, `SVamseekar/masova-mobile`, `SVamseekar/MaSoVaCrewApp`, `SVamseekar/masova-support`, and `SVamseekar/masova-enterprise-fleet` demonstrates comprehensive contract drift, broken HTTP paths, mismatched HTTP verbs, missing enum states, and incompatible query parameters.

---

## 2. In-Depth Contract Matrix

### 2.1 Contract 1: Driver App Delivery Status vs. Commerce Service

* **Side A (Caller):** `SVamseekar/MaSoVaCrewApp`
  * **File:** `src/store/api/orderApi.ts`
  * **Symbol:** `updateOrderStatus`
  * **Lines:** 88–91
  * **Implementation:**
    ```typescript
    updateOrderStatus: builder.mutation<Order, { orderId: string; status: OrderStatus }>({
      query: ({ orderId, status }) => ({
        url: `/orders/${orderId}/status`,
        method: 'PATCH',
        body: { status },
      }),
    }),
    ```
* **Side B (Callee):** `SVamseekar/masova-platform` (`commerce-service`)
  * **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
  * **Symbol:** `OrderController.updateOrderStatus`
  * **Lines:** 204–211
  * **Implementation:**
    ```java
    @PostMapping("/{orderId}/status")
    public ResponseEntity<OrderDto> updateOrderStatus(
            @PathVariable String orderId,
            @Valid @RequestBody UpdateOrderStatusRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        ...
    }
    ```
* **Contract Discrepancy & Concrete Failure:**
  * **HTTP Method Mismatch:** Driver app issues an HTTP `PATCH`. Spring Boot `@PostMapping` strictly matches HTTP `POST`.
  * **Production Consequence:** Spring MVC throws `HttpRequestMethodNotSupportedException`. The Gateway returns **HTTP 405 Method Not Allowed**. A driver using `MaSoVaCrewApp` cannot update the status of any order.

---

### 2.2 Contract 2: Driver App Active Order Ingestion vs. Commerce Service

* **Side A (Caller):** `SVamseekar/MaSoVaCrewApp`
  * **File:** `src/store/api/orderApi.ts`
  * **Symbol:** `getOrdersByStatus`
  * **Lines:** 82–84
  * **Implementation:**
    ```typescript
    getOrdersByStatus: builder.query<Order[], OrderStatus>({
      query: (status) => `/orders/status/${status}`,
    }),
    ```
* **Side B (Callee):** `SVamseekar/masova-platform` (`commerce-service`)
  * **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
  * **Symbol:** `OrderController.getOrders`
  * **Lines:** 144–154
  * **Implementation:**
    ```java
    @GetMapping
    public ResponseEntity<Page<OrderDto>> getOrders(
            @RequestParam(required = false) String storeId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            Pageable pageable) {
        ...
    }
    ```
* **Contract Discrepancy & Concrete Failure:**
  * **Path Drift:** The endpoint `/api/orders/status/{status}` was removed from `OrderController.java`. Orders are filtered solely via query parameters on the root endpoint (`GET /api/orders?status=...`).
  * **Production Consequence:** Requests to `/api/orders/status/DISPATCHED` fail with **HTTP 404 Not Found**. The Driver App receives empty arrays or network errors and renders zero assigned orders.

---

### 2.3 Contract 3: Customer Mobile Order Cancellation vs. Commerce Security Policy

* **Side A (Caller):** `SVamseekar/masova-mobile`
  * **File:** `src/services/orderApi.ts`
  * **Symbol:** `cancelOrder`
  * **Lines:** 58–61
  * **Implementation:**
    ```typescript
    cancelOrder: builder.mutation<Order, string>({
      query: (orderId) => ({
        url: `/orders/${orderId}`,
        method: 'DELETE',
      }),
    }),
    ```
* **Side B (Callee):** `SVamseekar/masova-platform` (`commerce-service`)
  * **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
  * **Symbol:** `OrderController.cancelOrder` & `OrderController.requestOrderCancellation`
  * **Lines:** 307–312, 325–331
  * **Implementation:**
    ```java
    @DeleteMapping("/{orderId}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
    public ResponseEntity<Void> cancelOrder(
            @PathVariable String orderId,
            @RequestParam(required = false) String reason) {
        ...
    }

    @PostMapping("/{orderId}/cancel-request")
    @PreAuthorize("hasRole('CUSTOMER')")
    public ResponseEntity<OrderDto> requestOrderCancellation(
            @PathVariable String orderId,
            @Valid @RequestBody CancelOrderRequest request) {
        ...
    }
    ```
* **Contract Discrepancy & Concrete Failure:**
  * **Authorization & Path Mismatch:** Backend security refactored cancellation into a two-phase manager approval flow for customers (`POST /api/orders/{orderId}/cancel-request`). Direct `DELETE` was restricted strictly to store staff.
  * **Production Consequence:** When a customer attempts to cancel their order in the mobile app, the backend returns **HTTP 403 Forbidden** because the customer lacks `ROLE_STAFF`. Customer cancellation is completely broken.

---

### 2.4 Contract 4: Delivery Order Stages & Missing `OUT_FOR_DELIVERY` Enum

* **Side A (Client Domain):** `SVamseekar/masova-mobile`
  * **File:** `src/screens/OrderTrackingScreen.tsx`
  * **Symbol:** `DELIVERY_ORDER_STAGES` & `getCurrentStageIndex`
  * **Lines:** 36–43, 85–92
  * **Implementation:**
    ```typescript
    const DELIVERY_ORDER_STAGES: OrderStatus[] = [
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'BAKED',
      'READY',
      'DISPATCHED',
      'DELIVERED',
    ];
    ```
* **Side B (Backend Domain):** `SVamseekar/masova-platform` (`shared-models`)
  * **File:** `shared-models/src/main/java/com/masova/shared/enums/OrderStatus.java`
  * **Symbol:** `OrderStatus`
  * **Lines:** 8–12
  * **Implementation:**
    ```java
    public enum OrderStatus {
        PENDING, CONFIRMED, PREPARING, BAKED, READY,
        DISPATCHED, OUT_FOR_DELIVERY, DELIVERED, COMPLETED, CANCELLED
    }
    ```
* **Contract Discrepancy & Concrete Failure:**
  * **Missing State in Frontend:** When logistics dispatches a driver, the order transitions to `OUT_FOR_DELIVERY`.
  * In `OrderTrackingScreen.tsx:L85`:
    ```typescript
    const getCurrentStageIndex = (status: OrderStatus) => {
      return DELIVERY_ORDER_STAGES.indexOf(status);
    };
    ```
  * `DELIVERY_ORDER_STAGES.indexOf('OUT_FOR_DELIVERY')` evaluates to `-1`.
  * **Production Consequence:** In `OrderTrackingScreen.tsx:L501`, rendering of the delivery OTP and live tracking stages depends on `currentStage >= 5`. Because `indexOf` returns `-1`, all tracking step indicators uncheck, progress appears reset, and the customer's delivery OTP card completely vanishes from the screen during active transit.

---

### 2.5 Contract 5: Enterprise AI Fleet Multi-Status Query Crash

* **Side A (Caller):** `SVamseekar/masova-enterprise-fleet`
  * **File:** `masova_fleet/ops_tools.py`
  * **Symbol:** `count_active_orders`
  * **Line:** 180
  * **Implementation:**
    ```python
    response = await client.get(
        f"{BASE_URL}/api/orders",
        params={"status": "RECEIVED,PREPARING,OVEN,BAKED,READY", "storeId": store_id}
    )
    ```
* **Side B (Callee):** `SVamseekar/masova-platform` (`commerce-service`)
  * **File:** `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java`
  * **Symbol:** `OrderController.getOrders`
  * **Line:** 193
  * **Implementation:**
    ```java
    if (status != null && !status.isEmpty()) {
        Order.OrderStatus orderStatus = Order.OrderStatus.valueOf(status);
        orders = orderRepository.findByStoreIdAndStatus(storeId, orderStatus);
    }
    ```
* **Contract Discrepancy & Concrete Failure:**
  * **Enum Parsing Crash:** `Enum.valueOf()` expects an exact match to a single enum identifier. It does not parse comma-separated lists.
  * **Production Consequence:** Passing `"RECEIVED,PREPARING,OVEN,BAKED,READY"` triggers `java.lang.IllegalArgumentException: No enum constant com.masova.commerce.entity.Order.OrderStatus.RECEIVED,PREPARING,OVEN,BAKED,READY`. The server crashes with **HTTP 500 Internal Server Error**. The AI Operations agent fails on its fundamental active order count check whenever targeting real backend microservices.

