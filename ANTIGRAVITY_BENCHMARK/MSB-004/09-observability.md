# Document 09 — Observability, Telemetry & Tracing Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** Spring Boot Actuator, Micrometer, SLF4J, Correlation Filters, API Gateway
**Evaluator:** Independent Go-Live Board (Production Engineering, SRE, Observability)
**Date:** September 2026
**Status:** **REJECTED (CRITICAL OBSERVABILITY GAPS)**

---

## 1. Executive Summary & Observability Scorecard

Enterprise production operations across European jurisdictions require robust telemetry to meet regulatory standards (e.g. EU NIS 2 Directive, GDPR Art. 33 breach detection, DORA resilience metrics) and operational SLOs. A distributed microservices architecture must provide end-to-end distributed tracing, deterministic health probes, structured logging with correlation IDs, and actionable metric alerts.

The Board's audit reveals that **observability in MaSoVa is functionally broken**: distributed tracing is completely disconnected, health check probes have been intentionally disabled on the API Gateway to prevent timeout cascades, and logging lacks structured formatting while leaking customer PII.

```
+----------------------------------------------------------------------------------------------------+
|                                    OBSERVABILITY SCORECARD                                         |
+------------------------------+---------------------------+-----------------------------------------+
| Capability                   | Production Requirement    | Current Implementation State            |
+------------------------------+---------------------------+-----------------------------------------+
| Distributed Tracing          | W3C TraceContext / B3     | DISCONNECTED: Classes written, never used|
| API Gateway Health Checks    | Liveness/Readiness probes | DISABLED: health: enabled: false (504s) |
| Asynchronous Trace Propagation| AMQP Header Correlation   | ABSENT: Headers stripped over RabbitMQ  |
| Structured JSON Logging      | Logstash / JSON Appender  | UNSTRUCTURED: Plain text console string |
| Business Metric Telemetry    | Prometheus Counters/Gauges| MINIMAL: JVM-only; zero business metrics|
| Telemetry PII Sanitization   | Zero PII in log stream    | FAILING: Customer names & IDs in clear  |
+------------------------------+---------------------------+-----------------------------------------+
```

---

## 2. The Broken Distributed Tracing Architecture

The engineering repository contains trace correlation helper classes in `shared-models`, but architectural inspection demonstrates they are **orphaned dead code**.

### 2.1 The Orphaned Interceptors
- In `shared-models/src/main/java/com/MaSoVa/shared/filter/CorrelationIdFilter.java` and `CorrelationIdInterceptor.java`:
  - `CorrelationIdFilter` reads `X-Correlation-ID` or generates a UUID, placing it into SLF4J's `MDC`.
  - `CorrelationIdInterceptor` implements `ClientHttpRequestInterceptor` to extract the ID from MDC and append it to outbound HTTP requests.
- **The Reality:**
  - An exhaustive scan across all microservices (`core-service`, `commerce-service`, `payment-service`, `logistics-service`, `intelligence-service`) reveals that **not a single service registers `CorrelationIdFilter` in its filter chain**.
  - **Not a single service injects `CorrelationIdInterceptor` into its `RestTemplate` or `WebClient` beans**.
  - Every inter-service REST call made by `OrderServiceClient`, `PaymentServiceClient`, and `CustomerServiceClient` drops the incoming request context.
  - Upstream request IDs originating at the browser or API Gateway are terminated at the first service boundary.

### 2.2 Trace Context Loss Over RabbitMQ
- When `commerce-service` publishes an `OrderCreatedEvent` to RabbitMQ, the event payload is serialized via standard Jackson JSON serialization.
- AMQP message properties (`basicProperties.headers`) do not carry MDC correlation IDs or OpenTelemetry trace headers (`traceparent`).
- When `logistics-service` or `intelligence-service` consumes the message, it runs under an empty MDC context. If a delivery dispatch fails, engineers cannot link the consumer error back to the originating customer web request.

---

## 3. Crippled Health Probes: Actuator Disabled on Gateway

One of the most concerning findings in the production configuration is the intentional disabling of standard health checks on the ingress routing layer.

### 3.1 The Gateway Configuration
In `api-gateway/src/main/resources/application.yml`:
```yaml
# Lines 83-96
management:
  endpoints:
    web:
      exposure:
        include: "info,gateway,routes"  # Removed 'health' - it's causing 504 timeouts
  endpoint:
    health:
      enabled: false  # Disabled entirely to prevent timeout cascade
    gateway:
      enabled: true
  health:
    defaults:
      enabled: false
```

### 3.2 SRE Impact Analysis
1. **Developer Workaround Confirmed:** The engineers disabled `/actuator/health` because downstream microservice timeouts were cascading into gateway health probe failures, causing 504 Gateway Timeout errors.
2. **Orchestrator Blindness:**
   - In Kubernetes or Google Cloud Run, container liveness probes rely on HTTP GET `/actuator/health`.
   - Because `health` is disabled (`enabled: false`), the orchestrator cannot detect when Netty event loops deadlock, memory is exhausted, or the gateway stops routing traffic.
   - A locked or failing gateway instance will remain in the routing pool, continuously dropping user traffic.

---

## 4. Metrics, Alerting & SLO/SLI Gaps

### 4.1 Absence of Domain Business Metrics
- Micrometer is included via Spring Boot Actuator, exposing basic JVM telemetry (CPU, memory, garbage collection, thread counts).
- However, the platform lacks business-critical custom metrics:
  - No counter for payment failures by gateway (`payment_failures_total{gateway="stripe"}`).
  - No timer for kitchen order preparation latency (`order_prep_duration_seconds`).
  - No gauge for unassigned delivery orders (`delivery_unassigned_queue_size`).
  - No metric tracking dual-write failure rate (`database_dualwrite_failures_total`).
- Without these metrics, site reliability engineers cannot formulate meaningful Service Level Objectives (SLOs) or Service Level Indicators (SLIs).

### 4.2 Missing Alerting Rules & Dashboards
- The repository contains zero Prometheus alerting rules (`alerts.yml`), zero Grafana dashboards, and zero Alertmanager routing configurations.
- In production, incidents such as Stripe webhook failures or database connection pool exhaustion will occur completely undetected until angry customers contact restaurant staff.

---

## 5. Log Aggregation & Format Deficiencies

### 5.1 Unstructured Console Logging
In `api-gateway/src/main/resources/application.yml` lines 80–81:
```yaml
pattern:
  console: "%d{yyyy-MM-dd HH:mm:ss} - %msg%n"
```
- Logs are formatted as raw text strings without JSON serialization.
- Standard fields required for modern log ingestion (Loki, Elasticsearch, Google Cloud Logging) such as `severity`, `trace_id`, `span_id`, `service_name`, and `environment` are completely missing.
- Centralized log filtering and aggregation across 6 distributed services will be unparseable during high-volume outages.

---

## 6. Observability Remediation Roadmap

To satisfy production operational certification, the following changes must be implemented:

1. **Activate OpenTelemetry / Micrometer Tracing:**
   Add `micrometer-tracing-bridge-otel` and `opentelemetry-exporter-otlp` to all service POMs to automatically inject W3C trace headers across HTTP and RabbitMQ boundaries.
2. **Re-Enable Actuator Health with Isolation:**
   Re-enable `/actuator/health` on the API Gateway. Configure health indicator isolation (`management.health.livenessstate.enabled: true`, `management.health.readinessstate.enabled: true`) without cascading synchronous downstream pings.
3. **Structured JSON Logging:**
   Migrate all Logback configurations to `LogstashEncoder` emitting JSON structured logs containing `traceId`, `spanId`, `service`, and `environment`.
4. **Publish Core Business Metrics:**
   Instrument `PaymentService`, `OrderService`, and `DeliveryService` with Micrometer `MeterRegistry` counters and distribution summaries.

---

**Board Certification Conclusion:** **REJECT**. Operating this microservices cluster in production is flying blind.

