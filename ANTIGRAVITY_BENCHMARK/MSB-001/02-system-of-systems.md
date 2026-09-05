# 02 - System of Systems Architecture

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Concrete Ecosystem Architecture

The MaSoVa platform is engineered as a distributed microservice topology fronted by Spring Cloud Gateway, mediated by RabbitMQ event brokers, and accessed by two distinct React Native mobile clients, a Next.js administrative frontend, and two Python agent systems.

### 1.1 Architectural Topology Diagram

```mermaid
flowchart TD
    subgraph Clients["External Clients & Frontends"]
        Mobile["masova-mobile\n(Customer RN 0.81)"]
        Driver["MaSoVaCrewApp\n(Driver RN 0.83)"]
        Web["masova-platform/frontend\n(Staff Next.js 14)"]
        Support["masova-support\n(FastAPI AI Agent)"]
        Fleet["masova-enterprise-fleet\n(LangGraph AI Ops)"]
    end

    subgraph Perimeter["Perimeter & Edge"]
        Gateway["api-gateway :8080\nSpring Cloud Gateway\n(JwtAuthFilter, ForwardedHeader)"]
    end

    subgraph DirectPorts["DIRECT EXPOSED DOCKER HOST PORTS (Dell 192.168.50.88)"]
        P_Core[":8085"]
        P_Commerce[":8084"]
        P_Logistics[":8086"]
        P_Intel[":8087"]
        P_Payment[":8089"]
    end

    subgraph CoreServices["Backend Microservices (Spring Boot 3.2)"]
        Core["core-service :8085\n(Users, Stores, Loyalty)"]
        Commerce["commerce-service :8084\n(Orders, Menus, Kitchen)"]
        Logistics["logistics-service :8086\n(Dispatch, Drivers, POD)"]
        Intel["intel-service :8087\n(Analytics, Forecasting)"]
        Payment["payment-service :8089\n(Stripe, Razorpay, Webhooks)"]
    end

    subgraph Persistence["Persistence & Messaging Tier"]
        Mongo[("MongoDB 7.0 :27017")]
        Postgres[("PostgreSQL 16 :5432")]
        Rabbit[("RabbitMQ 3.13 :5672\n(masova.events)")]
        Redis[("Redis 7.2 :6379\n(Rate Limiting & Cache)")]
    end

    %% Client ingress
    Mobile -->|HTTP REST| Gateway
    Driver -.->|HTTP REST (Broken Paths)| Gateway
    Web -->|HTTP / NextAuth| Gateway
    Support -->|HTTP REST Direct/Gateway| Commerce
    Fleet -->|HTTP REST Direct/Gateway| Commerce

    %% Gateway Routing
    Gateway -->|/api/auth/**, /api/users/**| Core
    Gateway -->|/api/orders/**, /api/menu/**| Commerce
    Gateway -->|/api/logistics/**| Logistics
    Gateway -->|/api/intel/**| Intel
    Gateway -->|/api/payments/**| Payment

    %% Host Port Bypasses (Vulnerability)
    Mobile -.->|LAN Bypass Threat| P_Commerce
    Support -.->|Direct Call Threat| P_Commerce
    P_Commerce --> Commerce
    P_Core --> Core
    P_Logistics --> Logistics
    P_Payment --> Payment

    %% Inter-service Feign
    Commerce -->|OpenFeign Sync| Payment
    Commerce -->|OpenFeign Sync| Logistics
    Commerce -->|OpenFeign Sync| Core
    Logistics -->|OpenFeign Sync| Commerce

    %% Event Broker
    Commerce -->|Publish: order.created, order.status| Rabbit
    Payment -->|Publish: payment.success| Rabbit
    Logistics -->|Publish: delivery.assigned| Rabbit
    Rabbit -->|Consume| Intel
    Rabbit -->|Consume| Core

    %% Data Stores
    Core --> Mongo & Postgres
    Commerce --> Mongo & Postgres
    Payment --> Mongo
    Logistics --> Mongo
    Gateway --> Redis
```

---

## 2. Perimeter Routing & Filter Configuration

Perimeter ingress is governed by `api-gateway` (`masova-platform/api-gateway`).

### 2.1 Route Definitions
As defined in `api-gateway/src/main/resources/application.yml`:
* **Core Service Route:** Matches `/api/auth/**`, `/api/users/**`, `/api/stores/**` -> forwards to `http://core-service:8085`.
* **Commerce Service Route:** Matches `/api/orders/**`, `/api/menu/**`, `/api/categories/**` -> forwards to `http://commerce-service:8084`.
* **Payment Service Route:** Matches `/api/payments/**`, `/api/webhooks/**` -> forwards to `http://payment-service:8089`.
* **Logistics Service Route:** Matches `/api/logistics/**`, `/api/drivers/**`, `/api/deliveries/**` -> forwards to `http://logistics-service:8086`.
* **Intel Service Route:** Matches `/api/intel/**`, `/api/analytics/**` -> forwards to `http://intel-service:8087`.

### 2.2 Security Filters & Header Handling
* **`JwtAuthenticationFilter.java` (`api-gateway/src/main/java/com/masova/gateway/filter/JwtAuthenticationFilter.java:L58-112`):**
  * Intercepts inbound HTTP requests.
  * Validates bearer tokens against public key / secret.
  * Extracts user identity, roles, and tenant metadata.
  * Populates downstream headers: `X-User-Id`, `X-User-Role`, `X-Tenant-Id`.
* **`ForwardedHeaderFilter.java` & Gateway Sanitization (`GatewayConfig.java:L299`):**
  * Strips spoofable internal assertion headers such as `X-Internal-Service` from incoming external requests.
  * **Critical Flaw:** This sanitization occurs *strictly* at the Gateway boundary.

---

## 3. Network Boundaries & The Perimeter Bypass

While the Gateway implements security filtering, the physical deployment configuration completely voids the perimeter:

### 3.1 Direct Port Exposure
* **Citation:** `masova-platform/docker-compose.yml:L23-160`
  * `core-service`: exposes `"8085:8085"` to host `0.0.0.0`
  * `commerce-service`: exposes `"8084:8084"` to host `0.0.0.0`
  * `logistics-service`: exposes `"8086:8086"` to host `0.0.0.0`
  * `intel-service`: exposes `"8087:8087"` to host `0.0.0.0`
  * `payment-service`: exposes `"8089:8089"` to host `0.0.0.0`
* **Consequence:**
  * As documented in `AGENTS.md:L7`, the backend runs on Dell host `192.168.50.88`.
  * Any device on the local network (or any container sharing the bridge) can bypass `api-gateway:8080` entirely by dispatching requests directly to `http://192.168.50.88:8084`.
  * Downstream services inspect `X-Internal-Service` directly (e.g., `commerce-service/src/main/java/com/masova/commerce/controller/OrderController.java:L383-394`). When requests bypass the gateway, arbitrary callers can inject `X-Internal-Service: payment-service` to manipulate order payment states without JWT authentication.

---

## 4. Inter-Service Communication Patterns

### 4.1 Synchronous Invocations (Spring Cloud OpenFeign)
* Synchronous REST coupling exists across the microservice core:
  * `commerce-service` invokes `payment-service` via `PaymentServiceClient.java` to verify transactions.
  * `commerce-service` invokes `core-service` via `CustomerServiceClient.java` to award loyalty points (`updateOrderStats`).
  * `logistics-service` invokes `commerce-service` via `OrderServiceClient.java` to mark orders delivered.
* **Failure Blast Radius:** Network timeouts or thread pool saturation on downstream Feign clients directly block upstream HTTP request execution unless wrapped in Hystrix/Resilience4j circuit breakers. In several clients (e.g. `payment-service/src/main/java/com/masova/payment/client/OrderServiceClient.java:L114-120`), fallback logic silently swallows exceptions, causing distributed state divergence.

### 4.2 Asynchronous Event Choreography (RabbitMQ)
* Central Topic Exchange: `masova.events`
* Key Routing Patterns:
  * `order.created` -> Bound to `intel.orders.queue` (Analytics ingest).
  * `order.status.changed` -> Bound to `logistics.orders.queue` (Auto-dispatch trigger).
  * `payment.success` -> Bound to `commerce.payments.queue` (Asynchronous order confirmation).
* **Idempotency Gaps:** Consumers in `intel-service` and `core-service` do not maintain atomic deduplication tables against `messageId`, leading to duplicate metrics if RabbitMQ redelivers unacknowledged messages.

