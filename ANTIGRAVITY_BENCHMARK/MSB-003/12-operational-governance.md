# MSB-003 — European Multi-Store Chain Readiness Audit
## Document 12: Operational Governance, Observability & Site Reliability Audit

**Target Enterprise:** European Restaurant Chain (100 Stores, High-Availability Infrastructure)  
**Evaluator:** VP of Site Reliability Engineering (SRE), Head of Infrastructure & CTO  
**Scope:** Observability, Telemetry, Logging, Security Governance, Disaster Recovery, Deployments  
**Confidence Classification:** `[VERIFIED]` (Verified via Docker Compose, application configurations, and source)  
**Verdict:** **OPERATIONAL DEFICIT (LACK OF ENTERPRISE OBSERVABILITY & RECOVERY CONTROLS)**  

---

### 1. Enterprise Operational Requirements vs. Source Reality

Operating 100 mission-critical physical retail restaurants across 5 countries requires rigorous operational governance:
* Can an on-call engineer diagnose a payment failure at Store `DOM042` (Milan) within 60 seconds?
* Can the security operations center (SOC) prove that database audit logs were not tampered with after an intrusion?
* Can the platform survive the total loss of an AWS/GCP availability zone or cloud region?
* Does the platform emit per-store and per-country Service Level Objectives (SLOs) and error budgets?

Below is an empirical audit of operational capabilities present in the repository.

---

### 2. Forensic Discovery 1: Vulnerable & Swallowed Audit Logging

Under SOC2 Type II, ISO 27001, and PCI-DSS Requirement 10:
* Audit logs must be tamper-proof, append-only, synchronized with trusted NTP time sources, and transmitted off-cluster to a secure Write-Once-Read-Many (WORM) storage target (e.g. AWS CloudTrail / S3 Object Lock / Splunk / Datadog).

#### Source Evidence in `shared-models`:
In `shared-models/src/main/java/com/MaSoVa/shared/service/AuditService.java`:
```java
28:     @Async
29:     public void logAudit(AuditLog auditLog) {
30:         if (auditLog == null) {
31:             logger.warn("Attempted to log null audit log");
32:             return;
33:         }
34:         try {
35:             mongoTemplate.save(auditLog);
36:             logger.info("Audit log saved: {} - {} on {}/{}", ...);
37:         } catch (Exception e) {
38:             logger.error("Failed to save audit log", e);
39:         }
40:     }
```

#### Fatal Security Governance Deficiencies:
1. **Mutable Local Storage:**
   Audit logs are written to a standard MongoDB collection (`audit_logs`) within the primary operational database. Anyone possessing MongoDB administrative credentials can run `db.audit_logs.deleteMany({})` or update log records with zero audit trail.
2. **Swallowed Exceptions on Load:**
   The method is annotated `@Async` and catches all exceptions in line 37, simply writing to `logger.error`. If MongoDB is saturated during an incident, **security audit records are silently dropped**. An attacker generating massive brute-force attacks can intentionally trigger this condition to evade logging.
3. **No External SIEM Integration:**
   There is zero syslog forwarding, zero integration with AWS GuardDuty, Datadog, or Elastic SIEM, and zero cryptographic chaining of log entries.

---

### 3. Forensic Discovery 2: Observability & Monitoring Gaps

An audit of `docker-compose.yml`, `pom.xml`, and `application.yml` across all services reveals:
1. **No Distributed Tracing (OpenTelemetry / Zipkin / Jaeger):**
   * While microservices make synchronous HTTP calls (`intelligence-service` -> `commerce-service` -> `core-service`) and publish AMQP events, there is **no W3C Trace Context or OpenTelemetry tracer** configured.
   * Diagnosing cross-service latency spikes during the Friday peak rush requires manually cross-referencing disjointed log timestamps across 6 service logs.
2. **No Metrics Aggregation (Prometheus / Grafana):**
   * Standard Spring Boot Actuator (`/actuator/health`, `/actuator/info`) is enabled, but there is no Prometheus scraping configuration (`micrometer-registry-prometheus` is absent or unconfigured in several POMs).
   * There are no pre-built Grafana dashboard JSON models in the repository.
3. **Absence of Multi-Tenant Tagging in Telemetry:**
   * JVM and HTTP metrics emitted by Spring Boot do not include dimensional tags for `tenantId`, `countryCode`, or `storeId`.
   * An SRE cannot view a dashboard showing "Error Rate for Spain" or "P99 Latency for Store DOM010". Telemetry is a monolithic black box.
4. **No Centralized Alerting Rules:**
   * The repository contains zero Prometheus alerting rules, zero PagerDuty webhooks, and zero deadman switches.

---

### 4. Forensic Discovery 3: Secret Management & Key Rotation

In `docker-compose.yml` and service `application.yml` files:
1. **Static Plaintext Environment Variables:**
   * Database passwords, JWT signing secrets (`jwt.secret`), Stripe API keys, and RabbitMQ credentials are passed directly as plain environment strings.
   * There is no integration with HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets with automated rotation.
2. **Key Rotation Impossibility (Symmetric JWT):**
   * JWT tokens are verified using a single static symmetric secret string across all services.
   * The system does not support the JSON Web Key Set (JWKS) standard with key identifiers (`kid`).
   * If a security incident necessitates rotating the JWT secret, **every active session across all 100 stores is abruptly terminated**, forcing cashiers, kitchen staff, managers, and mobile customers to re-authenticate simultaneously, risking gateway thundering herds.

---

### 5. Disaster Recovery, RPO / RTO & Schema Evolution

| Operational Area | Enterprise Target (Tier 1 Retail) | MaSoVa Implementation Reality | Risk Assessment |
| :--- | :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | $\le 1$ Minute (Zero data loss) | **UNDEFINED / $> 24$ Hours** (No automated WAL archiving or replica oplog sync) | **CRITICAL**: Database crash risks losing hours of customer transactions. |
| **RTO (Recovery Time Objective)** | $\le 15$ Minutes (Automated multi-AZ failover) | **UNDEFINED / Manual** (Requires manual Docker container redeployment) | **CRITICAL**: Prolonged restaurant downtime during network or node failure. |
| **PostgreSQL Migrations** | Zero-downtime Blue/Green migrations | Flyway configured in POMs, but migrations run on startup (`spring.flyway.enabled=true`). | **MEDIUM**: Startup locks block container readiness during rolling updates. |
| **MongoDB Migrations** | Schema versioning & backward compatibility | **Zero versioning framework** (No Mongock / Flyway Mongo). Schemas evolve ad-hoc. | **HIGH**: Model changes cause deserialization crashes across mixed-version pods. |
| **Backup / Restore Automation** | Hourly snapshots with automated test-restores | **Completely absent** from source and deployment scripts. | **HIGH**: Untested backup procedures guarantee disaster recovery failures. |

---

### 6. CTO Verdict on Operational Governance

The platform represents a developmental prototype lacking enterprise operational maturity:
1. Audit logging is mutable and silently drops records under stress.
2. Complete absence of distributed tracing, Prometheus metrics aggregation, and tenant dashboards.
3. Secret and key rotation cannot be performed without universal system downtime.
4. Disaster recovery targets (RPO/RTO) are undefined and unautomated.

**Operational Governance Readiness: CRITICAL FAILURE / BLOCKED**
