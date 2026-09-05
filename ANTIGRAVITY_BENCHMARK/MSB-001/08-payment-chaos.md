# 08 - Payment Systems & Concurrency Chaos Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Summary

Financial operations in MaSoVa span `payment-service` (Stripe and Razorpay gateways, webhook ingestion, refund processing) and `commerce-service` (order payment lifecycle). An adversarial analysis of this subsystem reveals severe transactional vulnerabilities: unauthenticated payment overrides via network spoofing, silent data loss in circuit breaker fallbacks, race conditions enabling double refunds, and absence of distributed locking.

---

## 2. In-Depth Vulnerability Analysis

### 2.1 Critical Finding 1: Unauthenticated Payment Status Override via Header Spoofing
* **Component:** `SVamseekar/masova-platform` (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/controller/OrderController.java`
* **Symbol:** `updatePaymentStatus`
* **Lines:** 380–396
* **Implementation:**
  ```java
  @PatchMapping("/{orderId}/payment")
  public ResponseEntity<Order> updatePaymentStatus(
          @PathVariable String orderId,
          @Valid @RequestBody UpdatePaymentStatusRequest request,
          jakarta.servlet.http.HttpServletRequest httpRequest) {
      String internalCaller = httpRequest.getHeader("X-Internal-Service");
      if (internalCaller == null || internalCaller.isBlank()) {
          // Not an internal call — require MANAGER/ASSISTANT_MANAGER/STAFF role
          var auth = SecurityContextHolder.getContext().getAuthentication();
          boolean hasRole = auth != null && auth.getAuthorities().stream().anyMatch(a ->
                  a.getAuthority().equals("ROLE_MANAGER") ||
                  a.getAuthority().equals("ROLE_ASSISTANT_MANAGER") ||
                  a.getAuthority().equals("ROLE_STAFF"));
          if (!hasRole) {
              return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
      }
      return ResponseEntity.ok(orderService.updatePaymentStatus(orderId, request.getStatus(), request.getTransactionId()));
  }
  ```
* **Perimeter Configuration Flaw:**
  * In `commerce-service/src/main/java/com/MaSoVa/commerce/config/SecurityConfig.java:L51`, `/api/orders/*/payment` is explicitly declared as a public endpoint (`permitAll()`) so that service-to-service calls succeed without a user JWT.
  * In `docker-compose.yml:L119`, port 8084 is exposed to the host (`0.0.0.0:8084`), which translates on the Dell server to `192.168.50.88:8084`.
* **Exploit Scenario:**
  1. An attacker on the local network (or any compromised microservice container) sends an HTTP PATCH request directly to `http://192.168.50.88:8084/api/orders/{orderId}/payment`.
  2. The attacker injects the header `X-Internal-Service: payment-service` and body `{"status": "PAID", "transactionId": "fake_tx_123"}`.
  3. Because the gateway is bypassed, `GatewayConfig.java:L299` (which strips `X-Internal-Service`) never runs.
  4. `OrderController.java:L384` checks `internalCaller != null`, skips all role checks, and marks the unpaid order as `PAID`.
  5. The kitchen prepares and dispatches food for free.

---

### 2.2 Critical Finding 2: Circuit Breaker Fallback Swallows Payment State Synchronization
* **Component:** `SVamseekar/masova-platform` (`payment-service`)
* **File:** `payment-service/src/main/java/com/MaSoVa/payment/service/OrderServiceClient.java`
* **Symbol:** `updateOrderPaymentStatusFallback`
* **Lines:** 114–120
* **Implementation:**
  ```java
  private void updateOrderPaymentStatusFallback(String orderId, String status, String transactionId, Exception ex) {
      log.warn("Circuit breaker fallback for updateOrderPaymentStatus. Order: {}, Status: {}, Transaction: {}, Error: {}",
              orderId, status, transactionId, ex.getMessage());
      // Don't throw exception - payment succeeded even if order update failed
      // This should be handled asynchronously or with retry logic
      // In production, this would trigger a compensating transaction or alert
  }
  ```
* **Failure Execution Path:**
  1. Customer completes checkout via Stripe. Stripe fires `payment_intent.succeeded` webhook to `StripeWebhookController.java`.
  2. `PaymentService.java` verifies the signature and writes the transaction to MongoDB with status `SUCCESS`.
  3. `PaymentService` invokes `orderServiceClient.updateOrderPaymentStatus(orderId, "PAID", txId)`.
  4. If `commerce-service` is slow, restarting, or encountering GC pauses, the circuit breaker trips or times out.
  5. `updateOrderPaymentStatusFallback()` is invoked. It prints a single log warning and **returns void without throwing**.
  6. `StripeWebhookController` receives HTTP 200 OK and acknowledges the webhook to Stripe.
  7. **Permanent Invariant Violation:** Money is deducted from the customer's bank account, but `commerce-service` never receives the status update. The order remains in `PENDING` payment state forever. There is no scheduled retry job, no transactional outbox table, and no dead-letter queue.

---

### 2.3 Critical Finding 3: TOCTOU Race Condition on Concurrent Refunds Enabling Double Refunding
* **Component:** `SVamseekar/masova-platform` (`payment-service`)
* **File:** `payment-service/src/main/java/com/MaSoVa/payment/service/RefundService.java`
* **Symbol:** `validateRefundable` & `initiateRefund`
* **Lines:** 169–181
* **Implementation:**
  ```java
  List<Refund> existingRefunds = refundRepository.findByTransactionId(request.getTransactionId());
  BigDecimal totalCommitted = existingRefunds.stream()
          .filter(r -> excludeRefundId == null || !excludeRefundId.equals(r.getId()))
          .filter(r -> r.getStatus() == Refund.RefundStatus.PROCESSED
                  || r.getStatus() == Refund.RefundStatus.PENDING_APPROVAL
                  || r.getStatus() == Refund.RefundStatus.INITIATED
                  || r.getStatus() == Refund.RefundStatus.PROCESSING)
          .map(Refund::getAmount)
          .reduce(BigDecimal.ZERO, BigDecimal::add);

  BigDecimal availableForRefund = transaction.getAmount().subtract(totalCommitted);
  if (request.getAmount().compareTo(availableForRefund) > 0) {
      throw new RuntimeException("Refund amount exceeds available refundable amount");
  }
  ```
* **Race Condition Mechanics:**
  1. Transaction amount is ₹1,000.
  2. Two concurrent refund requests for ₹1,000 (Request A and Request B) arrive simultaneously (e.g. rapid double-click in UI or two webhook events).
  3. Thread A executes line 169: queries `refundRepository.findByTransactionId()`, receives empty list, computes `availableForRefund = ₹1,000`.
  4. Thread B executes line 169 concurrently: queries `refundRepository`, receives empty list, computes `availableForRefund = ₹1,000`.
  5. Thread A proceeds, calls Razorpay/Stripe API, refunds ₹1,000, and saves `Refund` record.
  6. Thread B proceeds, calls Razorpay/Stripe API, refunds ₹1,000, and saves `Refund` record.
  7. **Consequence:** Both gateway API calls succeed. The customer receives ₹2,000 in refunds on a ₹1,000 transaction. There is no distributed Redis mutex lock (`RedissonClient`), database row lock (`SELECT FOR UPDATE`), or atomic MongoDB check-and-set operation protecting the refundable balance.

