# 12 - Driver App, Logistics, & Fleet Orchestration Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Ecosystem Fleet Architecture

Fleet operations are distributed across three distinct repositories:
1. `SVamseekar/MaSoVaCrewApp`: React Native mobile application for drivers and kitchen crew.
2. `SVamseekar/masova-platform` (`logistics-service`): Backend dispatch engine managing driver assignment, GPS breadcrumbs, and proof-of-delivery (POD) verification.
3. `SVamseekar/masova-enterprise-fleet`: Python autonomous multi-store operations agent orchestrating inventory and dispatch metrics.

---

## 2. In-Depth Fleet Disconnection & Failure Analysis

### 2.1 Critical Finding 1: Driver App is Decoupled from Logistics Service
* **Driver App Implementation:** `MaSoVaCrewApp/src/store/api/orderApi.ts:L82-95`
* **Logistics Controller:** `masova-platform/logistics-service/src/main/java/com/MaSoVa/logistics/delivery/controller/DeliveryController.java:L45-80`
* **Analysis:**
  * `logistics-service` exposes dedicated delivery management routes under `/api/logistics/deliveries/**`:
    * Driver assignment: `POST /api/logistics/deliveries/assign`
    * Location telemetry: `POST /api/logistics/deliveries/{id}/location`
    * Proof-of-delivery verification: `POST /api/logistics/deliveries/{id}/verify-otp`
  * However, `MaSoVaCrewApp` never calls any `/api/logistics/**` endpoints.
  * Instead, `MaSoVaCrewApp` attempts to manage delivery lifecycles by issuing direct calls to `/orders/**` in `commerce-service`.
  * **Consequence:** `logistics-service` has zero visibility into actions taken by drivers using `MaSoVaCrewApp`. Location tracking is non-existent, and driver location records in MongoDB remain unpopulated.

---

### 2.2 Critical Finding 2: The Triple-Point Failure in `ActiveDeliveryScreen.tsx`
* **File:** `MaSoVaCrewApp/src/screens/ActiveDeliveryScreen.tsx`
* **Lines:** 39–62
* **Code Trace:**
  ```typescript
  // L39-41: Fetch orders assigned to this driver with status DISPATCHED
  const { data: activeOrders, isLoading, error, refetch } = useGetOrdersByStatusQuery('DISPATCHED', {
    pollingInterval: 30000,
  });

  // L59-62: Mark delivered
  await updateOrderStatus({
    orderId,
    status: 'DELIVERED',
  }).unwrap();
  ```
* **Cascading Failure Breakdown:**
  1. **HTTP 404 on Ingestion:** `useGetOrdersByStatusQuery('DISPATCHED')` invokes `GET /orders/status/DISPATCHED` (`orderApi.ts:L83`). The endpoint does not exist on `OrderController.java`. The backend returns **HTTP 404 Not Found**. No active deliveries can ever load into the UI.
  2. **State Blindness on Transit:** Even if the query succeeded, it queries *only* `DISPATCHED`. Once an order transitions to `OUT_FOR_DELIVERY` (the canonical en-route state), it is excluded by the status filter and disappears from the driver's screen.
  3. **HTTP 405 on Completion:** When the driver attempts to click "Mark Delivered", `updateOrderStatus()` issues an HTTP `PATCH /orders/{orderId}/status` (`orderApi.ts:L88-91`). `OrderController.java:L205` exclusively accepts HTTP `POST`. The gateway returns **HTTP 405 Method Not Allowed**. The driver is completely unable to complete a delivery in the application.

---

### 2.3 Critical Finding 3: Enterprise Fleet Operations Agent Crash on Multi-Status Queries
* **Component:** `SVamseekar/masova-enterprise-fleet`
* **File:** `masova_fleet/ops_tools.py:L180`
* **Implementation:**
  ```python
  response = await client.get(
      f"{BASE_URL}/api/orders",
      params={"status": "RECEIVED,PREPARING,OVEN,BAKED,READY", "storeId": store_id}
  )
  ```
* **Backend Receiver:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L193`
  ```java
  if (status != null) {
      Order.OrderStatus orderStatus = Order.OrderStatus.valueOf(status);
      return ResponseEntity.ok(orderService.getOrdersByStatus(resolvedStoreId, orderStatus));
  }
  ```
* **Failure Analysis:**
  * `OrderController.java` treats `status` as a single enum value and calls `Enum.valueOf(status)`.
  * Passing `"RECEIVED,PREPARING,OVEN,BAKED,READY"` causes Java to throw `IllegalArgumentException`.
  * The backend returns **HTTP 500 Internal Server Error**.
  * The enterprise agent runs cleanly in local demo mode because `masova_fleet/demo_backend.py:L25` parses comma-separated status strings in SQLite, but the moment it is pointed at the actual Spring Boot production cluster, every active fleet health check crashes.

