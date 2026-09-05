# MSB-004: European Production Go-Live Certification Challenge
## Document 03: Environment Separation, Secrets Management & Authentication Architecture

**Date of Review:** September 4, 2026
**Benchmark Identity:** MSB-004 — Tests 2 & 3
**Category:** Environment Separation, Secrets Governance, Cryptographic Authentication
**Mode:** READ-ONLY Forensic Audit

---

### 1. Environment Separation Audit

A compliant production engineering baseline requires strict logical and physical isolation between Development, Staging, and Production environments:
- Dedicated, isolated credentials per environment.
- Separate database clusters with zero cross-environment connectivity.
- Isolated message queues and virtual hosts.
- Separate cloud projects, storage buckets, and secrets vaults.
- Absolute prevention of non-production configuration bleeding into production.

#### 1.1 Complete Absence of Production Profiles
An exhaustive scan across all six Java microservices, the API Gateway, and shared libraries reveals:
```
Total application-prod.yml files found: 0
Total application-production.yml files found: 0
Total application-staging.yml files found: 0
```
Every microservice contains only:
- `src/main/resources/application.yml` (Base configuration with active profile hardcoded to `dev`).
- `src/test/resources/application-test.yml` (Unit/integration test configuration).

In `docker-compose.yml:81, 121, 165, 212, 255, 288`, the environment variable across all backend containers is explicitly set to:
```yaml
- SPRING_PROFILES_ACTIVE=dev
```
In Dockerfiles across all services (e.g., `api-gateway/Dockerfile:37`):
```dockerfile
ENTRYPOINT ["sh", "-c", "java -jar -Xmx512m -XX:+UseContainerSupport -Dspring.profiles.active=${SPRING_PROFILES_ACTIVE:-dev} app.jar"]
```
If `SPRING_PROFILES_ACTIVE` is not provided in a production environment, the containers **silently default to the `dev` profile**.

#### 1.2 Cross-Environment Bleed Vectors
1. **Fallback to Development Localhost Defaults:**
   Across all `application.yml` configuration files, external dependencies default to local development endpoints and dev credentials if environment variables are missing:
   - `core-service/src/main/resources/application.yml:34-35`: `${RABBITMQ_USERNAME:masova}`, `${RABBITMQ_PASSWORD:[REDACTED_DEV_DEFAULT]}`.
   - `core-service/src/main/resources/application.yml:59-61`: `${SPRING_DATASOURCE_USERNAME:masova}`, `${SPRING_DATASOURCE_PASSWORD:[REDACTED_DEV_DEFAULT]}`.
   - `api-gateway/src/main/resources/application.yml:57-65`: Defaults downstream service URLs to `http://localhost:8084-8089`.
2. **Indian Test Data Bootstrapped on European Deployments:**
   - In `infrastructure/mongodb/init.js:31-75`, the default database bootstrap inserts sample store `"MaSoVa Banjara Hills"` located in Hyderabad, Telangana, India, with delivery radius in Indian pincode 500034 and `minimumOrderValueINR: 99.0`.
   - In `core-service/src/main/resources/application.yml:91`, Jackson serialization timezone is hardcoded to:
     ```yaml
     time-zone: Asia/Kolkata
     ```
     Operating European restaurant platforms under Indian Standard Time (IST, UTC+5:30) causes a 3.5 to 4.5 hour temporal drift across kitchen order tickets, delivery dispatch calculations, business day cutoffs, and tax audit timestamps.

---

### 2. Comprehensive Secrets Governance Audit

Every secret type utilized across the MaSoVa ecosystem has been inventoried and classified by storage mechanism, rotation support, and scoping.

```
+----------------------------------------------------------------------------------------------------+
|                                    SECRETS GOVERNANCE AUDIT TABLE                                  |
+----------------------------------------------------------------------------------------------------+
| Secret Classification   | In-Code Mechanism           | Storage Location        | Rotated? | Scoped?|
+-------------------------+-----------------------------+-------------------------+----------+--------+
| JWT Secret Key          | Hardcoded fallback in compose| docker-compose.yml:94   | NO       | GLOBAL |
| PostgreSQL Password     | Hardcoded default in config | application.yml:61      | NO       | GLOBAL |
| RabbitMQ Password       | Hardcoded default in config | application.yml:35      | NO       | GLOBAL |
| SonarQube Password      | Hardcoded plaintext in pom  | pom.xml:31              | NO       | GLOBAL |
| PII AES Encryption Key  | Environment variable        | PiiEncryptionService.java| NO      | SERVICE|
| Stripe Secret Key       | Placeholder in compose      | docker-compose.yml:179  | MANUAL   | SERVICE|
| Stripe Webhook Secret   | Placeholder in compose      | docker-compose.yml:181  | MANUAL   | SERVICE|
| Razorpay Key Secret     | Disabled placeholder        | application.yml:83      | NO       | SERVICE|
| Google OAuth Client ID  | Environment variable        | application.yml:102     | NO       | GLOBAL |
| Google Maps API Key     | Environment variable        | deploy.yml:125          | NO       | GLOBAL |
| Firebase Service Key    | Raw JSON in env var         | deploy.yml:124          | NO       | SERVICE|
| Brevo Email API Key     | Environment variable        | application.yml:168     | NO       | GLOBAL |
| Twilio Auth Token       | Environment variable        | application.yml:131     | NO       | GLOBAL |
| Google Gemini API Key   | Environment variable        | masova-support/.env     | NO       | GLOBAL |
+-------------------------+-----------------------------+-------------------------+----------+--------+
```

#### 2.1 Critical Secrets Findings

##### Finding SEC-08: Hardcoded JWT Secret in `docker-compose.yml`
In `docker-compose.yml:94, 135, 178, 225, 268, 294`, the identical plaintext secret key is explicitly committed and shared across all six services:
```yaml
JWT_SECRET=dev-jwt-secret-key-at-least-64-characters-long-for-hs512-security
```
In `shared-security/src/main/java/com/MaSoVa/shared/security/util/JwtTokenProvider.java:18-20`, the team established a denylist for a previous leaked secret:
```java
/** Known leaked default — denylisted for one release to catch stale environments. */
static final String DENYLISTED_LEAKED_SECRET =
        "MaSoVa-secret-key-for-jwt-token-generation-very-long-key-must-be-at-least-256-bits-for-production-security";
```
However, the developers simply replaced the denylisted key in `docker-compose.yml` with another static hardcoded string (`dev-jwt-secret-key-...`). Because this key is publicly committed to version control, anyone with repository access can forge cryptographically valid HS512 JWT tokens for any user, manager, or administrator on any deployment using the default configuration.

##### Finding SEC-09: Hardcoded Administrative Credentials in `pom.xml`
In root `pom.xml:29-31`:
```xml
<sonar.host.url>http://192.168.50.88:9000</sonar.host.url>
<sonar.login>admin</sonar.login>
<sonar.password>admin</sonar.password>
```
Administrative credentials for the internal code quality server are hardcoded in the primary Maven project descriptor.

##### Finding SEC-10: Single Database Superuser Without Scoping
All microservices connect to PostgreSQL using the identical database user `masova` with password `masova_secret`. There are no dedicated per-service database users (e.g., `core_user`, `payment_user`, `commerce_user`).
Because `infrastructure/postgres/01-init.sql` grants ownership of all schemas to `masova`, any SQL injection or vulnerability in `intelligence-service` or `commerce-service` allows attackers to directly query, alter, or drop tables in `payment_schema` and `core_schema`.

##### Finding SEC-11: Absence of Cloud Secret Manager Integration
There is zero source-level integration with Google Cloud Secret Manager, HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault. In `.github/workflows/deploy.yml:97-128`, dozens of sensitive production credentials (database passwords, Stripe keys, RabbitMQ passwords, Twilio tokens, Firebase private keys) are passed as raw command-line string arguments to `gcloud run deploy --set-env-vars`. This exposes secrets in plaintext in GitHub Actions workflow execution logs and GCP Cloud Run container metadata.

---

### 3. Authentication Architecture & Token Revocation Defect

#### 3.1 JWT Architecture
- **Algorithm:** HMAC-SHA512 (HS512) symmetric signing (`JwtTokenProvider.java:34`).
- **Token Lifetime:**
  - Access Token: 3,600,000 ms (1 Hour) (`application.yml:95`).
  - Refresh Token: 604,800,000 ms (7 Days) (`application.yml:96`).
  - Kiosk Access Token: 28,800,000 ms (8 Hours) (`application.yml:97`).
- **Shortcoming:** Symmetric signing requires every single microservice and the API Gateway to share the exact same private HMAC secret. If any microservice is compromised, the attacker can forge tokens for the entire ecosystem. The platform does not use asymmetric keys (RS256 or ES256 with public-key distribution).

#### 3.2 Token Revocation "Fail-Open" Vulnerability
Token revocation (logout / session invalidation) is implemented via Redis blacklisting.
In `shared-security/src/main/java/com/MaSoVa/shared/security/filter/JwtAuthenticationFilter.java:83-90`:
```java
private boolean isBlacklisted(String token) {
    if (redisTemplate == null) return false; // fail-open if Redis not wired in this service
    try {
        return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + token));
    } catch (Exception e) {
        return false; // fail-open: don't lock users out if Redis is down
    }
}
```
**The Flaw:**
If Redis experiences an outage, network partition, or connection timeout, the method catches the exception and returns `false` ("fail-open").
Consequently, **all previously revoked tokens, compromised tokens, and logged-out sessions immediately become valid again across all microservices**. An attacker holding a stolen JWT token can continue authenticating indefinitely during any Redis maintenance or failure window.

---

### 4. Verdict for Tests 2 & 3: FAIL

**Finding:** The platform has no verified production environment isolation. Secrets are hardcoded in build files and compose configurations, shared database credentials destroy service boundaries, symmetric JWT keys are distributed across all services, and session revocation fails open during Redis downtime.

