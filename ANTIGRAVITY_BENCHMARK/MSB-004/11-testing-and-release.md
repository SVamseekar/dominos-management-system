# Document 11 — Testing, Quality Assurance & Release Engineering Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** Build Toolchains, Dockerfiles, Test Suites, CI/CD Workflows
**Evaluator:** Independent Go-Live Board (Quality Assurance, Release Engineering, SRE)
**Date:** September 2026
**Status:** **REJECTED (CRITICAL BUILD DEFECT & INADEQUATE TEST SUITES)**

---

## 1. Executive Summary & Quality Engineering Scorecard

An enterprise software ecosystem serving restaurants across multiple European nations must demonstrate rigorous quality engineering, deterministic release artifact generation, and thorough non-functional testing (concurrency, load, chaos, and security regression testing).

The Board's evaluation identified a fatal release engineering blocker alongside severe testing deficiencies:
1. **The production frontend container CANNOT BUILD:** `frontend/Dockerfile.production` attempts to execute `npm run build` (`tsc -b && vite build`) after running `npm ci --only=production`, which purposefully strips the TypeScript compiler and Vite bundler.
2. **Non-Functional Testing is Non-Existent:** There are zero concurrency stress tests, zero chaos/fault-injection tests, zero load testing scripts, and zero automated security scanning gates in CI/CD.

```
+----------------------------------------------------------------------------------------------------+
|                                    TESTING & RELEASE SCORECARD                                     |
+------------------------------+---------------------------+-----------------------------------------+
| Quality Dimension            | Requirement               | Current Implementation Status           |
+------------------------------+---------------------------+-----------------------------------------+
| Unit Testing                 | >80% Line Coverage        | Partial (~60-70% in Java, Mockito)      |
| Integration Testing          | Spring Boot Test / MockMvc| Moderate (Testcontainers used in part)  |
| Contract Testing             | Pact / Consumer-Driven    | Minimal (Vitest Pact config present)    |
| Concurrency / Race Testing   | Multi-threaded Stress     | ZERO TESTS (No webhook or cart race test)|
| Chaos / Fault Injection      | Network partitions, OOM   | ZERO TESTS (No Toxiproxy / Chaos Mesh)  |
| Load & Scalability Testing   | Performance baselines     | ZERO SCRIPTS (No k6 / Gatling / JMeter) |
| Production Container Build   | Deterministic Dockerfile  | BROKEN: Dockerfile.production fails     |
| Static Analysis / SAST       | CI Quality Gate           | Local-only; hardcoded Sonar credentials |
+------------------------------+---------------------------+-----------------------------------------+
```

---

## 2. Fatal Release Blocker: Broken Frontend Production Dockerfile

The engineering team claims the application is containerized and ready for production deployment. Forensic analysis of the frontend production Dockerfile proves that the release pipeline has never successfully built this image.

### 2.1 The Code Inspection
In `frontend/Dockerfile.production`:
```dockerfile
# Stage 1: Build the React app
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production      <--- LINE 13: STRIPS DEV DEPENDENCIES

# Copy source code
COPY . .

# Build the app
RUN npm run build                 <--- LINE 19: FAILS (COMMAND NOT FOUND)
```

In `frontend/package.json`:
```json
"scripts": {
  "build": "tsc -b && vite build"
},
"devDependencies": {
  "typescript": "^5.x.x",
  "vite": "^6.x.x"
}
```

### 2.2 Forensic Root Cause & Impact
- `npm ci --only=production` explicitly ignores all packages listed in `devDependencies`.
- The build script `npm run build` executes `tsc -b && vite build`.
- Neither `tsc` (TypeScript compiler) nor `vite` (bundler) exists in the container node modules when `npm ci --only=production` is invoked.
- Executing `docker build -f Dockerfile.production .` immediately crashes with:
  ```
  sh: tsc: not found
  npm ERR! code 127
  ```
- **Finding REL-01:** The team has never successfully built or tested their production frontend container image. Any attempted deployment to production using this artifact will instantly fail.

---

## 3. Analysis of Existing Test Suites

### 3.1 Unit & Service Tests
- **Java Backend:**
  Services contain standard Spring Boot tests utilizing Mockito and JUnit 5 (e.g., `OrderServiceTest.java`, `PaymentServiceTest.java`).
  *Defect:* Crucial failure branches are heavily mocked. For example, in payment tests, `orderServiceClient.updateOrderPaymentStatus` is mocked to return `true`, completely masking the fatal circuit breaker exception-swallowing bug (`PAY-01`) identified in Document 06.
- **Frontend Tests:**
  `frontend/src/` contains component and slice tests executed via Vitest. Coverage focuses on UI rendering and state mutations.

### 3.2 Contract Testing (`vitest.pact.config.ts`)
- The frontend includes a configuration for consumer-driven contract testing via Pact.
- However, verification tasks in the Java backend do not run Pact provider verification during Maven builds (`mvn test`). Contract adherence is not enforced across the service boundary.

---

## 4. The Complete Void in Non-Functional Testing

In an ecosystem handling distributed payments, real-time kitchen order dispatch, and fleet logistics, non-functional failure modes are the most common source of production outages.

```
       +-------------------------------------------------------------+
       |                  CRITICAL TESTING VOIDS                     |
       +-------------------------------------------------------------+
       | [X] Concurrency & Race Conditions                           |
       |     - Zero tests verifying simultaneous cart checkouts      |
       |     - Zero tests simulating concurrent Stripe webhooks      |
       |     - Zero tests on inventory double-allocation             |
       +-------------------------------------------------------------+
       | [X] Chaos & Network Fault Injection                         |
       |     - Zero tests simulating Redis network timeouts          |
       |     - Zero tests validating RabbitMQ broker disconnects     |
       |     - Zero tests evaluating PostgreSQL pool exhaustion      |
       +-------------------------------------------------------------+
       | [X] Load & Performance Testing                              |
       |     - Zero k6, Gatling, or JMeter load testing suites       |
       |     - Peak dinner rush concurrency (e.g. 500 req/s) untested|
       |     - Memory leak behavior during sustained load unknown    |
       +-------------------------------------------------------------+
       | [X] Dynamic Application Security Testing (DAST)             |
       |     - Zero automated OWASP ZAP scans in CI                  |
       |     - Gateway header bypass vulnerability left undetected   |
       +-------------------------------------------------------------+
```

---

## 5. CI/CD Pipeline & Deployment Vulnerabilities

Inspection of `.github/workflows/deploy.yml` reveals critical operational flaws:

1. **Direct Production Deployment Without Staging Verification:**
   The workflow triggers deployment on every push to `main` directly to Cloud Run without an intermediate staging environment or automated smoke test gate.
2. **Indian Cloud Run Region:**
   Lines 90–95 deploy the containers to GCP `asia-south1`, violating EU data sovereignty rules.
3. **Hardcoded Secrets & Plaintext Tokens:**
   As uncovered in Document 03, container environment variables in the workflow pass hardcoded JWT secrets and SonarQube credentials.
4. **No Automated Rollback:**
   If a container image fails health checks or throws runtime exceptions post-deployment, the pipeline does not roll back traffic to the previous revision.

---

## 6. Release Engineering Go-Live Requirements

The following requirements must be resolved prior to production authorization:

1. **Remediate Multi-Stage Dockerfile:**
   Refactor `frontend/Dockerfile.production` to install all dependencies (`RUN npm ci`) during the build stage, compile the static bundle, and copy only `/dist` to the runtime Nginx container.
2. **Develop Concurrency & Webhook Test Suite:**
   Implement end-to-end integration tests using Testcontainers simulating concurrent duplicate Stripe webhooks, circuit breaker trips, and inventory contention.
3. **Automate Load Testing Gate in CI:**
   Create k6 load test suites simulating 500 concurrent checkout sessions and enforce P95 latency < 500ms before release tagging.
4. **Enforce SAST / DAST Security Scanning:**
   Integrate automated dependency scanning (`npm audit`, Trivy container scanner, OWASP Dependency-Check) with zero tolerance for High/Critical CVEs.

---

**Board Certification Conclusion:** **REJECT**. The release pipeline produces broken artifacts, and testing practices fail to validate production stability.

