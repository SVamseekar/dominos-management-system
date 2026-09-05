# 13 - AI Agent Governance & Autonomy Audit

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Summary

The MaSoVa ecosystem integrates artificial intelligence across two repositories:
1. `SVamseekar/masova-support`: Customer conversational support agent built with FastAPI and Google Gemini.
2. `SVamseekar/masova-enterprise-fleet`: Enterprise autonomous fleet and operations multi-agent system.

Both systems are governed by architectural rules defined in `docs/guidelines/domain-rules.md:L57-61` and `docs/guidelines/decisions.md` (Decisions D11 and D15), which mandate a Human-in-the-Loop (HITL) proposal/approval gate and strictly prohibit direct agent writes to databases.

---

## 2. Policy Engine & Safety Guardrails Audit

### 2.1 Governance Compliance in `masova-support`
* **File:** `masova-support/src/masova_agent/runtime/policy.py:L13-68`
* **Implementation:**
  * Tools are categorized into risk tiers: `READ`, `COMPUTE`, `PROPOSE`, and `EXECUTE`.
  * `DEFAULT_TOOL_REGISTRY` explicitly blocks the following tools from agent execution:
    * `patch_menu_price`: `RiskTier.EXECUTE`
    * `execute_purchase_order`: `RiskTier.EXECUTE`
    * `execute_refund`: `RiskTier.EXECUTE`
    * `cancel_order_immediate`: `RiskTier.EXECUTE`
    * `send_campaign_live`: `RiskTier.EXECUTE`
    * `confirm_shifts`: `RiskTier.EXECUTE`
* **Audit Finding:** `masova-support` strictly adheres to Decision D15 by confining high-risk mutations to `RiskTier.PROPOSE`.

### 2.2 Customer Identity Binding & Contract Divergence
* **File:** `masova-support/src/masova_agent/tools/backend_tools.py:L18-34`
* **Implementation:**
  ```python
  def _headers() -> dict:
      identity = get_current_identity()
      return {
          "Content-Type": "application/json",
          "Authorization": f"Bearer {identity.raw_token}",
      }
  ```
* **Order Cancellation Routing:**
  * In `backend_tools.py:L373`:
    ```python
    data = _post(f"/orders/{order_id}/cancel-request", {"reason": reason})
    ```
* **Critical Ecosystem Divergence:**
  * The AI Support Agent is correctly aligned with the backend's refactored approval workflow: it invokes `POST /api/orders/{orderId}/cancel-request`.
  * In contrast, the human customer using the mobile app (`masova-mobile`) invokes `DELETE /api/orders/{orderId}` and gets HTTP 403.
  * **Paradoxical Production Consequence:** A customer asking the AI chatbot to cancel their order succeeds in creating an approval request, whereas that same customer tapping "Cancel Order" on their mobile app order details screen suffers an HTTP 403 error.

---

## 3. Vulnerabilities & Operational Failures in Agent Ecosystem

### 3.1 Unhandled Backend Enum Crashes in Enterprise Fleet
* **File:** `masova-enterprise-fleet/src/masova_fleet/ops_tools.py:L180`
* **Implementation:**
  ```python
  response = await client.get(
      f"{BASE_URL}/api/orders",
      params={"status": "RECEIVED,PREPARING,OVEN,BAKED,READY", "storeId": store_id}
  )
  ```
* **Failure Execution:**
  * When invoked against the live `commerce-service` (`OrderController.java:L193`), Java executes `Order.OrderStatus.valueOf("RECEIVED,PREPARING,OVEN,BAKED,READY")`.
  * Java throws `IllegalArgumentException`, and the backend responds with HTTP 500.
  * The AI Operations agent crashes during its health check cycle, unable to monitor store operations in live environments.

### 3.2 Session Poisoning & Memory Contamination
* **Component:** `masova-support` (`redis_session_service.py`)
* **Analysis:**
  * Conversation history is persisted in Redis Database 1 (`decisions.md:L74`).
  * If an attacker injects adversarial prompts into order notes or customer support chats (prompt injection), the tainted dialogue history is retrieved on subsequent turns.
  * Although tool boundaries prevent direct execution, the agent's contextual understanding of order status and delivery updates can be manipulated to mislead customers regarding food readiness or driver ETA.

