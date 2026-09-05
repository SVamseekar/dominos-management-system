# 11 - Customer Mobile Application Drift Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Mobile Architecture Overview

The customer mobile application (`SVamseekar/masova-mobile`) is a bare React Native 0.81.0 client interfacing with `api-gateway:8080`. It manages cart operations, checkout flows, order history, and real-time delivery tracking across Android and iOS platforms.

---

## 2. In-Depth Drift & Runtime Failure Analysis

### 2.1 Critical Drift 1: Customer Order Cancellation HTTP 403 Lockout
* **Mobile Client Code:** `src/services/api/orderApi.ts:L57-61`
  ```typescript
  cancel: async (orderId: string, reason?: string): Promise<Order> => {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    const response = await httpClient.delete<Order>(`/orders/${orderId}${params}`);
    return response.data;
  },
  ```
* **Backend Security Specification:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java:L307-310`
  ```java
  @DeleteMapping("/{orderId}")
  @PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")
  public ResponseEntity<Void> cancelOrder(...)
  ```
* **Execution Outcome:**
  * When an end-user presses "Cancel Order" on their mobile screen, `orderApi.cancel()` issues an HTTP `DELETE /api/orders/{orderId}`.
  * The authenticated user's JWT has `userType=CUSTOMER`, giving authority `ROLE_CUSTOMER`.
  * Downstream Spring Security evaluates `@PreAuthorize("hasAnyRole('MANAGER', 'ASSISTANT_MANAGER', 'STAFF')")`, denies access, and responds with **HTTP 403 Forbidden**.
  * The backend introduced a dedicated customer cancellation endpoint:
    `POST /api/orders/{orderId}/cancel-request` (`OrderController.java:L325`), which creates a pending request requiring staff approval.
  * The mobile application was never updated to adopt this endpoint. As a result, customer cancellation in the mobile app is completely dead.

---

### 2.2 Critical Drift 2: UI Progress Freeze & OTP Vanishing on `OUT_FOR_DELIVERY`
* **Mobile Client Code:** `src/screens/order/OrderTrackingScreen.tsx:L36-43, L159-161, L168-185`
  ```typescript
  const DELIVERY_ORDER_STAGES: { status: OrderStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { status: 'RECEIVED', label: 'Order Received', icon: 'checkmark-circle' },
    { status: 'PREPARING', label: 'Preparing', icon: 'restaurant' },
    { status: 'OVEN', label: 'In Oven', icon: 'flame' },
    { status: 'BAKED', label: 'Ready', icon: 'fast-food' },
    { status: 'DISPATCHED', label: 'On the Way', icon: 'bicycle' },
    { status: 'DELIVERED', label: 'Delivered', icon: 'home' },
  ];

  const getCurrentStageIndex = () => {
    return orderStages.findIndex((stage) => stage.status === currentStatus);
  };
  ```
* **Backend Status Progression:** `shared-models/src/main/java/com/MaSoVa/shared/enums/OrderStatus.java:L10`
  * When a driver picks up the order from the store, the status transitions to `OUT_FOR_DELIVERY`.
* **Concrete Execution Failure:**
  1. WebSocket or REST polling pushes `order.status = "OUT_FOR_DELIVERY"`.
  2. `getCurrentStageIndex()` executes `orderStages.findIndex(s => s.status === 'OUT_FOR_DELIVERY')`.
  3. Because `OUT_FOR_DELIVERY` is absent from `DELIVERY_ORDER_STAGES`, `findIndex()` evaluates to `-1`.
  4. In `renderProgressBar()` (`L169-170`):
     ```typescript
     const isCompleted = index < currentIndex; // false for all index >= 0
     const isCurrent = index === currentIndex;     // false for all index >= 0
     ```
  5. Every stage dot reverts to inactive gray (`theme.colors.border`), checkmarks disappear, and the pulsing animation halts.
  6. In `OrderTrackingScreen.tsx:L501`, conditional rendering of the Delivery OTP Card and Driver Phone link relies on stage progression. The OTP card abruptly disappears from the customer's phone exactly when the delivery partner arrives at their doorstep.

---

### 2.3 Drift 3: Public Unauthenticated Track Endpoint Missing Redaction in Typings
* **Mobile Client Code:** `src/services/api/orderApi.ts:L38-41`
  ```typescript
  track: async (orderId: string): Promise<Order> => {
    const response = await httpClient.get<Order>(`/orders/track/${orderId}`);
    return response.data;
  },
  ```
* **Backend Response Schema:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/dto/OrderTrackingDTO.java:L14-21`
* **Mismatch Analysis:**
  * The mobile method `track(orderId)` asserts a return type of full `Order` (expecting customer phone, address, pricing subtotals, tax breakdown).
  * However, `OrderController.java:L137` returns `OrderTrackingDTO`, which omits customer PII, totals, taxes, and payment details.
  * Any screen consuming `orderApi.track()` expecting `order.total` or `order.deliveryAddress` encounters `undefined` property access errors.

