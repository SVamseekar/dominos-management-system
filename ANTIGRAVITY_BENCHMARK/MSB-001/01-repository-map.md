# 01 - Ecosystem Repository Map

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Executive Ecosystem Summary

The MaSoVa restaurant management ecosystem comprises five discrete repositories spanning Java/Spring Boot microservices, React/Next.js and React Native frontends, and Python AI agent systems. While product documentation presents MaSoVa as a cohesive, voice-first, dual-database restaurant platform, an adversarial audit reveals that the five repositories have diverged in contracts, data models, authentication semantics, and operational assumptions.

Below is the verified ecosystem inventory established through direct filesystem inspection and git commit verification.

---

## 2. Repository Inventory & Environmental Matrix

| Repository Identifier                    | Local Filesystem Path                                                     | Git Remote                                              | Active Branch                 | Inspected Commit SHA                                                                            | Declared Role                                                                                                  | Actual Technical Reality                                                                                                                                                                            |
| :--------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------ | :---------------------------- | :---------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`SVamseekar/masova-platform`**         | `/Users/souravamseekarmarti/Projects/MaSoVa-restaurant-management-system` | `git@github.com:SVamseekar/masova-platform.git`         | `main`                        | `c74156991b77754bf4b7c9a36092d2388af05f14`                                                      | Core backend platform: 6 Java microservices, PostgreSQL/MongoDB dual-write, RabbitMQ, Next.js staff web portal | Monolithic multi-module Maven build hosting 6 Spring Boot 3.2 services and Next.js 14 web app. Dual-write pattern is inverted and partially absent; direct port exposure bypasses gateway security. |
| **`SVamseekar/masova-support`**          | `/Users/souravamseekarmarti/Projects/masova-support`                      | `https://github.com/SVamseekar/masova-support.git`      | `main`                        | `8da4e5d3d74be9522ae9b3dae253abede12f79e5`                                                      | AI Support Agent: Customer support conversational agent via FastAPI and LangChain/LangGraph                    | Standalone FastAPI service running Python 3.11+. Interacts with platform via REST Feign/HTTP endpoints; implements local ticket handling and Gemini/OpenAI integrations.                            |
| **`SVamseekar/masova-mobile`**           | `/Users/souravamseekarmarti/Projects/masova-mobile`                       | `https://github.com/SVamseekar/masova-mobile.git`       | `main`                        | `0dcdbbe22199b4d8c3f04d5f68a4aecabc53fc90`                                                      | Customer Mobile Application: iOS/Android food ordering, tracking, and loyalty                                  | Bare React Native 0.81.0 (Metro port 8888, TypeScript). Directly calls backend API gateway; exhibits severe contract drift on cancellation and delivery stage tracking.                             |
| **`SVamseekar/MaSoVaCrewApp`**           | `/Users/souravamseekarmarti/Projects/MaSoVaCrewApp`                       | `https://github.com/SVamseekar/MaSoVaDriverApp.git`     | `security-remediation-plan-b` | `1eee77112665619e6321330f14fcbd1da2401079` (`main`: `114897d93a21ca1647e060b4782ea9cbebd7dade`) | Driver & Crew Mobile Application: Delivery fulfillment, dispatching, and POD                                   | Bare React Native 0.83.1 (TypeScript). Pointed at obsolete and non-existent backend REST endpoints; unable to fulfill deliveries or receive active orders.                                          |
| **`SVamseekar/masova-enterprise-fleet`** | `/Users/souravamseekarmarti/Projects/masova-enterprise-fleet`             | `git@github.com:SVamseekar/masova-enterprise-fleet.git` | `main`                        | `77b83987e7a4e149c45c505105b2f069b413d781`                                                      | Enterprise Multi-Store Fleet: AI Operations agent, multi-store orchestrator                                    | Python CLI / Agent system (LangGraph/LangChain). Relies on internal API endpoints that crash in real production due to enum parsing assumptions; runs demo mode via SQLite mock.                    |

---

## 3. Detailed Component Deep-Dive

### 3.1 `SVamseekar/masova-platform`
* **Architecture:** Multi-module Maven repository (`pom.xml`) containing:
  * `shared-models` & `shared-security`: Common domain enums, DTOs, JWT utilities, and filters.
  * `api-gateway`: Spring Cloud Gateway (Port 8080) routing to downstream microservices with JWT claims extraction and `X-Internal-Service` header stripping.
  * `core-service`: Port 8085. User identity, store configuration, restaurant settings, loyalty engine.
  * `commerce-service`: Port 8084. Menu, order lifecycle, payment status updating, kitchen display integration.
  * `payment-service`: Port 8089. Payment intent creation, Stripe and Razorpay webhook processing, refund execution.
  * `logistics-service`: Port 8086. Driver assignment, delivery dispatch, proof-of-delivery (POD) verification via OTP.
  * `intel-service`: Port 8087. Analytics, demand forecasting, inventory consumption tracking.
  * `frontend/`: Next.js 14 / React 18 administrative staff web application (Port 3000).
* **Infrastructure Dependencies:** Docker Compose (`docker-compose.yml`) defining:
  * MongoDB 7.0 (Port 27017)
  * PostgreSQL 16 (Port 5432)
  * RabbitMQ 3.13 (Ports 5672, 15672)
  * Redis 7.2 (Port 6379)
* **Declared vs. Actual Role:**
  * *Declared:* Polyglot persistence dual-write system guaranteeing PostgreSQL transactional integrity first, MongoDB projection second.
  * *Actual:* Inverted dual-write in `core-service` and `commerce-service` (MongoDB primary, PostgreSQL secondary swallowed in `catch`), and total absence of PostgreSQL in `payment-service` and `logistics-service`.

---

### 3.2 `SVamseekar/masova-support`
* **Architecture:** FastAPI Python microservice (`src/masova_agent/main.py`, Port 8000).
* **Runtime & Dependencies:** Python 3.11+, Poetry / `pyproject.toml`, FastAPI, Uvicorn, LangChain, LangGraph, Pydantic v2.
* **Integrations:**
  * Calls `commerce-service` and `core-service` REST endpoints for customer order status lookups and menu queries.
  * Connects to vector stores for FAQ embeddings.
* **Declared vs. Actual Role:**
  * *Declared:* Enterprise customer support AI capable of automated ticket resolution and store-aware answering.
  * *Actual:* Operates without shared security context or JWT propagation; interacts with backend endpoints as an unauthenticated or hardcoded internal client.

---

### 3.3 `SVamseekar/masova-mobile`
* **Architecture:** React Native 0.81.0 mobile application targeting iOS and Android.
* **Runtime & Dependencies:** Node.js 18+, React 18.3.1, React Native 0.81.0, Redux Toolkit, React Navigation v6.
* **Target Services:** Directly connects to `api-gateway:8080` (configured via `.env` / `src/services/api.ts`).
* **Declared vs. Actual Role:**
  * *Declared:* Full customer portal for ordering, table booking, live delivery tracking, and loyalty management.
  * *Actual:* Contains major contract drift: calls deprecated `DELETE /orders/{id}` which gets HTTP 403; does not support `OUT_FOR_DELIVERY` state, breaking UI progress visualization and OTP presentation.

---

### 3.4 `SVamseekar/MaSoVaCrewApp`
* **Architecture:** React Native 0.83.1 mobile application.
* **Runtime & Dependencies:** Node.js 20+, React 19.0.0, React Native 0.83.1, Redux Toolkit (`@reduxjs/toolkit` 2.6.1).
* **Target Services:** Connects to `api-gateway:8080` or direct service ports.
* **Declared vs. Actual Role:**
  * *Declared:* Dedicated delivery partner and crew mobile app handling shift management, route navigation, and delivery completion.
  * *Actual:* Severely broken contract with backend: calls removed `GET /orders/status/{status}` (HTTP 404), uses wrong HTTP method `PATCH /orders/{orderId}/status` (HTTP 405), completely misses `OUT_FOR_DELIVERY` status, and bypasses logistics proof-of-delivery flows.

---

### 3.5 `SVamseekar/masova-enterprise-fleet`
* **Architecture:** Python autonomous operations and multi-store fleet management framework (`masova_fleet/`).
* **Runtime & Dependencies:** Python 3.11+, LangGraph, Click, Rich, httpx.
* **Integrations:** Designed to monitor and manage multi-store metrics, inventory balancing, and staff scheduling across the platform.
* **Declared vs. Actual Role:**
  * *Declared:* Multi-store autonomous AI operations platform for enterprise restaurant chains.
  * *Actual:* Built against an idealized mock API (`masova_fleet/demo_backend.py`); production queries crash against Spring Boot backend (e.g. sending comma-separated status query parameters that crash `OrderController.java`).

---

## 4. Evidence Trace Summary Matrix

| Verification Item            | Verified Ground Truth                                                                             | Evidence Citation                                                         |
| :--------------------------- | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------ |
| **Git Repositories Present** | 5 of 5 repositories physically present on macOS host                                              | Filesystem paths inspected                                                |
| **Commit Integrity**         | All 5 repos inspected at precise commit hashes                                                    | Shell git revisions confirmed                                             |
| **Java Microservices**       | 6 discrete services managed by root Maven POM                                                     | `masova-platform/pom.xml:L22-30`                                          |
| **Gateway Ports**            | Port 8080 (Gateway), 8084 (Commerce), 8085 (Core), 8086 (Logistics), 8087 (Intel), 8089 (Payment) | `docker-compose.yml:L23-160`                                              |
| **Mobile Frameworks**        | React Native CLI (bare), Metro bundler                                                            | `masova-mobile/package.json`, `MaSoVaCrewApp/package.json`                |
| **AI Agents**                | Python FastAPI & LangGraph CLI                                                                    | `masova-support/pyproject.toml`, `masova-enterprise-fleet/pyproject.toml` |

