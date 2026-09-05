# MSB-004: European Production Go-Live Certification Challenge
## Document 01: Deployment Architecture & Attack Surface Reconstruction

**Date of Review:** September 4, 2026
**Benchmark Identity:** MSB-004 — Test 1
**Category:** Deployment Architecture, Infrastructure Topology, Surface Area Analysis
**Mode:** READ-ONLY Forensic Audit

---

### 1. Actual Deployment Architecture Reconstruction

The MaSoVa ecosystem is architecturally divided into six Spring Boot 3.5.16 microservices, one Python FastAPI AI support service, a Vite/React web application, two React Native mobile applications, and a multi-store enterprise fleet manager.

The platform targets two deployment configurations:
1. **On-Premise / Edge / Developer Host (Dell i3 / Docker Compose)** defined in `docker-compose.yml`.
2. **Cloud Serverless Architecture (GCP Cloud Run)** defined in `.github/workflows/deploy.yml`.

```
                                  +-------------------------------------------------------------+
                                  |                     PUBLIC INTERNET                         |
                                  +-------------------------------------------------------------+
                                      |                    |                    |
                         Port 8080    |       Port 8084    |       Port 8085    |   Port 8089
                       (API Gateway)  |     (Commerce Svc) |      (Core Svc)    |  (Payment Svc)
                                      v                    v                    v
+-----------------------------------------------------------------------------------------------+
| HOST / DOCKER / CLOUD RUN BOUNDARY                                                            |
|                                                                                               |
|  +--------------------+   Forward   +------------------------------------------------------+  |
|  |    api-gateway     |------------>|   core-service (8085)     | commerce-service (8084)  |  |
|  |     (Port 8080)    |             |   Users, Stores, GDPR     | Menu, Orders, Kitchen    |  |
|  +--------------------+             |                           |                          |  |
|            |                        |   payment-service (8089)  | logistics-service (8086) |  |
|            |                        |   Stripe, Razorpay, Refund| Delivery, Fleet, Waste   |  |
|            v                        |                           |                          |  |
|     masova-network                  |   intelligence-svc (8087) | masova-support (8000)    |  |
|     (Docker Bridge)                 |   BI, Analytics, Churn    | FastAPI, Gemini Agent    |  |
|                                     +------------------------------------------------------+  |
|                                                 |                     |                       |
|                                                 v                     v                       v
|  +-----------------------------------------------------------------------------------------+  |
|  | STATEFUL INFRASTRUCTURE (Exposed to 0.0.0.0 on Host in docker-compose.yml)              |  |
|  |                                                                                         |  |
|  |  MongoDB 7.0 (27017:27017)       PostgreSQL 15 (5432:5432)   Redis 7.2 (6379:6379)      |  |
|  |  No Auth configured              Single user 'masova'        No requirepass configured  |  |
|  |  Databases: masova_core,         Shared DB: masova_db        Unauthenticated in dev     |  |
|  |  masova_commerce, masova_payment Schemas: core_schema, etc.                             |  |
|  |                                                                                         |  |
|  |  RabbitMQ 3.12 (5672:5672, Management: 15672:15672) - Default creds: masova/masova_sec  |  |
|  +-----------------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------------+
```

---

### 2. Comprehensive Inventory of Services, Databases & Queues

#### 2.1 Backend Microservices Matrix
| Service                    | Runtime / Framework                                           | Container Port | Host Port Binding | Database Connection                                                                   | Messaging         | Evidence File & Lines                                                                                   |
| :------------------------- | :------------------------------------------------------------ | :------------: | :---------------: | :------------------------------------------------------------------------------------ | :---------------- | :------------------------------------------------------------------------------------------------------ |
| **`api-gateway`**          | Java 21 / Spring Boot 3.5.16 / Spring Cloud Gateway           |     `8080`     |    `8080:8080`    | None                                                                                  | None              | `docker-compose.yml:280-304`, `api-gateway/src/main/resources/application.yml:1-122`                    |
| **`core-service`**         | Java 21 / Spring Boot 3.5.16 / Spring Data Mongo & JPA        |     `8085`     |    `8085:8085`    | MongoDB (`masova_core`), PostgreSQL (`core_schema`), Redis (`6379`)                   | RabbitMQ (`5672`) | `docker-compose.yml:73-112`, `core-service/src/main/resources/application.yml:1-99`                     |
| **`commerce-service`**     | Java 21 / Spring Boot 3.5.16 / Spring Data Mongo & JPA        |     `8084`     |    `8084:8084`    | MongoDB (`masova_commerce`), PostgreSQL (`commerce_schema`), Redis (`6379`)           | RabbitMQ (`5672`) | `docker-compose.yml:113-156`, `commerce-service/src/main/resources/application.yml:1-99`                |
| **`payment-service`**      | Java 21 / Spring Boot 3.5.16 / Spring Data Mongo (JPA unused) |     `8089`     |    `8089:8089`    | MongoDB (`masova_payment`), PostgreSQL (`payment_schema` Flyway only), Redis (`6379`) | RabbitMQ (`5672`) | `docker-compose.yml:157-203`, `payment-service/src/main/resources/application.yml:1-77`                 |
| **`logistics-service`**    | Java 21 / Spring Boot 3.5.16 / Spring Data Mongo & JPA        |     `8086`     |    `8086:8086`    | MongoDB (`masova_logistics`), PostgreSQL (`logistics_schema`), Redis (`6379`)         | RabbitMQ (`5672`) | `docker-compose.yml:204-246`, `logistics-service/src/main/resources/application.yml:1-99`               |
| **`intelligence-service`** | Java 21 / Spring Boot 3.5.16 / Spring Data Mongo              |     `8087`     |    `8087:8087`    | MongoDB (`masova_analytics`), Redis (`6379`)                                          | RabbitMQ (`5672`) | `docker-compose.yml:247-279`, `intelligence-service/src/main/resources/application.yml:1-99`            |
| **`masova-support`**       | Python 3.11 / FastAPI / Google ADK                            |     `8000`     |    `8000:8000`    | SQLite / In-Memory (`chat.db`), Redis (`6379`)                                        | None              | `/Users/souravamseekarmarti/Projects/masova-support/Dockerfile`, `.github/workflows/deploy.yml:132-170` |

#### 2.2 Stateful Infrastructure Matrix
| Infrastructure | Image                             |    Host Port    | In-Container Port | Volume Storage                           | Credentials / Auth                                                                  | Evidence                                                               |
| :------------- | :-------------------------------- | :-------------: | :---------------: | :--------------------------------------- | :---------------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **MongoDB**    | `mongo:7.0`                       |     `27017`     |      `27017`      | `mongodb_data:/data/db`                  | **None** (No auth configured in Docker compose) `[CRITICAL]`                        | `docker-compose.yml:2-12`                                              |
| **Redis**      | `redis:7.2-alpine`                |     `6379`      |      `6379`       | `redis_data:/data`                       | **None** (No `requirepass` in command `redis-server --appendonly yes`) `[CRITICAL]` | `docker-compose.yml:14-24`                                             |
| **PostgreSQL** | `postgres:15-alpine`              |     `5432`      |      `5432`       | `postgres_data:/var/lib/postgresql/data` | `masova` / `masova_secret` (Shared single user across all services)                 | `docker-compose.yml:46-67`, `infrastructure/postgres/01-init.sql:1-17` |
| **RabbitMQ**   | `rabbitmq:3.12-management-alpine` | `5672`, `15672` |  `5672`, `15672`  | `rabbitmq_data:/var/lib/rabbitmq`        | `masova` / `masova_secret` (Default management login exposed)                       | `docker-compose.yml:26-45`                                             |

#### 2.3 Client & Frontend Deployments
| Client                                | Technology                        | Target Host / Port                          | API Gateway Ingress Endpoint                                    | Evidence File                                                   |
| :------------------------------------ | :-------------------------------- | :------------------------------------------ | :-------------------------------------------------------------- | :-------------------------------------------------------------- |
| **`frontend`** (Staff Web POS)        | React 19 / Vite / Tailwind        | Vercel / Firebase Hosting / Port 80 (Nginx) | `http://localhost:8080/api` or `https://masova-app.web.app/api` | `frontend/package.json:1-90`, `frontend/nginx.conf:1-36`        |
| **`masova-mobile`** (Customer Mobile) | React Native 0.81 (Bare workflow) | Metro Port 8888 / Standalone APK/IPA        | `http://192.168.50.88:8080/api`                                 | `masova-mobile/.env.example:1-18`, `masova-mobile/package.json` |
| **`MaSoVaCrewApp`** (Staff Mobile)    | React Native 0.83 (Bare workflow) | Standalone APK/IPA                          | `http://192.168.50.88:8080/api`                                 | `MaSoVaCrewApp/package.json`                                    |
| **`masova-enterprise-fleet`**         | FastAPI / React                   | Port 8005 / Port 5173                       | Inter-service calls to `api-gateway:8080`                       | `masova-enterprise-fleet/pyproject.toml`                        |

---

### 3. Attack Surface Reconstruction

```
+----------------------------------------------------------------------------------------------------+
|                                    ATTACK SURFACE MAP & EXPOSURE                                   |
+----------------------------------------------------------------------------------------------------+
| [1] PUBLIC ATTACK SURFACE:                                                                         |
|     • API Gateway HTTP (Port 8080)                                                                 |
|     • Actuator Gateway Routes (GET /actuator/routes, GET /actuator/gateway) [UNAUTHENTICATED]      |
|     • Cloud Run Direct Ingress: All 6 backend services deployed with --allow-unauthenticated       |
|       (core-service, commerce-service, payment-service, logistics-service, intelligence-service)   |
|                                                                                                    |
| [2] DIRECT SERVICE BYPASS ATTACK SURFACE:                                                          |
|     • Commerce Service direct port (8084): Unauthenticated PATCH /api/orders/{id}/payment          |
|     • Core Service direct port (8085): Direct invocation of /api/customers/get-or-create           |
|     • Payment Service direct port (8089): Direct invocation of /api/payments/refund                |
|     • Logistics Service direct port (8086): Direct invocation of /api/delivery/gdpr/anonymize      |
|                                                                                                    |
| [3] ADMINISTRATIVE ATTACK SURFACE:                                                                 |
|     • RabbitMQ Management UI (Port 15672) with default credentials 'masova' / 'masova_secret'      |
|     • Spring Boot Actuator endpoints (/actuator/metrics, /actuator/info) across microservices      |
|     • SonarQube Server at http://192.168.50.88:9000 with admin/admin hardcoded in root pom.xml:29 |
|                                                                                                    |
| [4] DATABASE & QUEUE EXPOSURE:                                                                     |
|     • PostgreSQL (Port 5432 bound to 0.0.0.0): Reachable with password 'masova_secret'            |
|     • MongoDB (Port 27017 bound to 0.0.0.0): ZERO AUTHENTICATION - completely open to network      |
|     • Redis (Port 6379 bound to 0.0.0.0): ZERO AUTHENTICATION - any network host can read/flush   |
|     • RabbitMQ AMQP (Port 5672 bound to 0.0.0.0): Accessible with 'masova' / 'masova_secret'      |
+----------------------------------------------------------------------------------------------------+
```

#### 3.1 Public Attack Surface
1. **API Gateway Exposure (`8080`):**
   - Exposes route aggregations for all microservices.
   - Rate limiting is configured at an excessively high threshold of `1000` requests per minute for both normal operations and login routes (`api-gateway/src/main/resources/application.yml:49-52`), rendering brute-force credential stuffing feasible.
   - Actuator route inspection endpoints (`/actuator/routes`, `/actuator/gateway`) are publicly exposed over HTTP without authentication (`api-gateway/src/main/resources/application.yml:87`).
2. **Public Cloud Run Deployments:**
   - In `.github/workflows/deploy.yml:90`, every backend microservice (`api-gateway`, `core-service`, `commerce-service`, `payment-service`, `logistics-service`, `intelligence-service`) is explicitly deployed to Google Cloud Run with `--allow-unauthenticated`.
   - Each microservice receives a publicly resolvable URL (e.g., `https://commerce-service-masova-app.run.app`).
   - Consequently, the API Gateway does not act as an impenetrable perimeter. Any external client can target microservices directly over HTTPS.

#### 3.2 Internal Attack Surface & Gateway Bypass
1. **The Direct Port Bypass:**
   - In `docker-compose.yml:79, 119, 163, 210, 253`, every backend service maps its container port directly to `0.0.0.0` on the host machine.
   - Any process on the local network (or any attacker accessing the host IP `192.168.50.88`) can bypass the API Gateway completely and send HTTP requests directly to port 8084 (`commerce-service`), 8085 (`core-service`), 8089 (`payment-service`), 8086 (`logistics-service`), and 8087 (`intelligence-service`).
2. **Missing In-Service Perimeter Protection:**
   - While `api-gateway/src/main/java/com/MaSoVa/gateway/config/GatewayConfig.java:299` strips the `X-Internal-Service` header on some gateway routes, `commerce-service` does not verify that requests originated from the Gateway.
   - By calling `http://192.168.50.88:8084` directly, an attacker bypasses the gateway's header stripping entirely.

#### 3.3 Database & Stateful Infrastructure Exposure
1. **Unauthenticated MongoDB (`27017:27017`):**
   - The MongoDB container definition in `docker-compose.yml:2-12` uses image `mongo:7.0` without enabling authentication (`--auth` flag is absent; `MONGO_INITDB_ROOT_USERNAME` is absent).
   - Any attacker on the host network can connect to MongoDB on port 27017 without a password, read all customer records, order histories, transactions, and employee profiles, or execute `dropDatabase()`.
2. **Unauthenticated Redis (`6379:6379`):**
   - `docker-compose.yml:14-24` runs `redis-server --appendonly yes` without `requirepass`.
   - Redis binds to `0.0.0.0:6379`. Any attacker can execute Redis commands, inspect cached customer sessions, poison cache keys, or flush the cache (`FLUSHALL`).
3. **Hardcoded PostgreSQL Credentials (`5432:5432`):**
   - Bound to `0.0.0.0:5432` with username `masova` and password `masova_secret`.
   - `infrastructure/postgres/01-init.sql` creates all schemas (`core_schema`, `commerce_schema`, `payment_schema`, `logistics_schema`, `intel_schema`) within the same database `masova_db` owned by the single user `masova`.
   - Compromise of any single service immediately grants full read/write/drop access across all other service schemas.

---

### 4. Cloud Dependencies & Third-Party Integrations

```
+----------------------------------------------------------------------------------------------------+
|                                    THIRD-PARTY CLOUD DEPENDENCIES                                  |
+----------------------------------------------------------------------------------------------------+
| Provider                 | Purpose                             | Region / Endpoint                 |
+--------------------------+-------------------------------------+-----------------------------------+
| Stripe                   | EU Payment processing & 3DS2        | Global API (api.stripe.com)       |
| Razorpay                 | India payment fallback (legacy)     | India (api.razorpay.com)          |
| Google Cloud Run         | Serverless container runtime        | asia-south1 (Mumbai, India!)      |
| Google Gemini API        | AI Support & Operations Agents      | generativelanguage.googleapis.com |
| Google Maps Platform     | Delivery geocoding, distance matrix | maps.googleapis.com               |
| Firebase / FCM           | Push notifications (Customer/Staff) | Global                            |
| Brevo (Sendinblue)       | Customer transaction emails         | Global API                        |
| Twilio                   | Customer SMS notifications          | Global API                        |
| Upstash Redis            | Cloud Redis in deploy.yml           | Public cloud endpoint             |
| CloudAMQP                | Cloud RabbitMQ in deploy.yml        | Public cloud endpoint             |
+----------------------------------------------------------------------------------------------------+
```

#### Critical Geographic Discrepancy:
In `.github/workflows/deploy.yml:10`, the cloud deployment environment variable is explicitly configured as:
```yaml
env:
  PROJECT_ID: masova-app
  REGION: asia-south1
  REGISTRY: asia-south1-docker.pkg.dev
```
The engineering team's automated deployment pipeline targets **`asia-south1` (Mumbai, India)**, NOT a European GCP region (e.g., `europe-west3` Frankfurt, `europe-west1` Belgium). Deploying European customer personal data and financial transaction processing to Cloud Run in Mumbai violates GDPR Chapter V cross-border transfer requirements and introduces excessive network latency (>150ms round-trip) to European point-of-sale terminals.

---

### 5. Architectural Verdict for Test 1: FAIL

**Finding:** The deployment architecture fails every standard of production engineering. Internal microservice ports and stateful databases are exposed without authentication to host networks; cloud deployments enable `--allow-unauthenticated` on internal microservices; and the CI/CD pipeline deploys European workloads to an Indian cloud region.

