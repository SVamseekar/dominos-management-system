# Document 08 — Backup, Disaster Recovery & Business Continuity Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** MaSoVa Persistence Fleet (PostgreSQL, MongoDB, Redis, RabbitMQ)
**Evaluator:** Independent Go-Live Board (Production Engineering, SRE, Business Continuity)
**Date:** September 2026
**Status:** **REJECTED (CATASTROPHIC DATA LOSS RISK)**

---

## 1. Executive Summary & Board Findings

A production deployment handling real European customer orders, payments, fiscal declarations, and employee records requires a mathematically proven and continuously tested Disaster Recovery (DR) and Business Continuity Plan (BCP). European regulations (including GDPR Art. 32(1)(c): *"the ability to restore the availability and access to personal data in a timely manner in the event of a physical or technical incident"*) mandate documented, automated, and verified data recovery systems.

The Board's exhaustive inspection of the MaSoVa platform yields a shocking finding:
### **The platform possesses ZERO automated database backup tooling, ZERO replication topologies, ZERO Point-in-Time Recovery (PITR) pipelines, and ZERO Disaster Recovery runbooks.**

The repository's top-level directory named `backups/` was found upon forensic inspection to contain **stale developer source code backups** (`build-monolith.sh.bak`, `pre-phase1-monolith`, `pre-phase1-services`, `user-service.log`) from historic monolith refactoring exercises, rather than automated database snapshot or export mechanisms.

```
+----------------------------------------------------------------------------------------------------+
|                                  DISASTER RECOVERY READINESS MATRIX                                |
+------------------------------+---------------------------+-----------------------------------------+
| Capability                   | Production Standard       | MaSoVa Current State                    |
+------------------------------+---------------------------+-----------------------------------------+
| Target RPO (Data Loss Window)| < 5 minutes               | Undefined / Total Permanent Loss        |
| Target RTO (Recovery Time)   | < 1 hour                  | Undefined / Unrecoverable               |
| Automated PostgreSQL Backup  | Daily full + continuous WAL| ZERO scripts (no pg_dump / pgBackRest)  |
| Automated MongoDB Backup     | Continuous oplog backup   | ZERO scripts (no mongodump / Atlas API) |
| Point-in-Time Recovery (PITR)| Supported to any second   | IMPOSSIBLE (archive_mode off, no oplog) |
| High Availability Replication| Multi-AZ Hot Standby      | Standalone single-instance containers   |
| Off-Site Snapshot Storage    | Immutable S3 / GCS bucket | NONE (local Docker volume only)         |
| DR Simulation Drills         | Quarterly automated drill | ZERO evidence of any test ever run      |
+------------------------------+---------------------------+-----------------------------------------+
```

---

## 2. Detailed Datastore Backup & Recovery Posture

### 2.1 PostgreSQL 15 (`postgres:15-alpine`)
- **Current Deployment:** Deployed in `docker-compose.yml` as a standalone single-container instance mapping local host volume `postgres_data:/var/lib/postgresql/data`.
- **Absence of Backup Automation:**
  - An exhaustive scan of all `.sh`, `.ps1`, `.yml`, and workflow files reveals **zero** invocations of `pg_dump`, `pg_dumpall`, `pgBackRest`, `wal-g`, or `barman`.
  - There is no cron daemon configured to take scheduled snapshots.
  - There is no integration with Google Cloud Storage (`gsutil` / `gcloud storage`) or AWS S3 to push backup artifacts off-site.
- **Physical Volume Vulnerability:**
  - If the host machine running Docker experiences drive failure, filesystem corruption, or accidental deletion of the Docker volume, **all restaurant accounts, dual-write order history, customer profiles, and staff employee records are permanently erased**.

---

### 2.2 MongoDB 6.0 (`mongo:6.0`)
- **Current Deployment:** Single standalone container mapping `mongodb_data:/data/db`.
- **Absence of Replica Set & Oplog:**
  - Standard MongoDB Point-in-Time Recovery and continuous backup require running MongoDB as a **Replica Set** (`--replSet rs0`) so that the operational log (`local.oplog.rs`) records every write operation.
  - MaSoVa runs MongoDB in standalone standalone mode without an active replica set. Because there is no oplog, continuous replication, change streaming, and point-in-time recovery are fundamentally disabled by the engine.
- **Absence of `mongodump` Automation:**
  - Zero scripts exist in the repository to execute `mongodump` or export collections.
  - The live operational collections (`orders`, `transactions`, `delivery_tracking`) reside solely in memory and un-mirrored disk blocks on a single container volume.

---

### 2.3 Redis 7.0 & RabbitMQ 3.12
- **Redis State:**
  - `docker-compose.yml` does not specify `appendonly yes`. Default snapshotting (`save 60 10000`) means any sudden server power loss drops all cart sessions and active token blacklists created during the preceding window.
- **RabbitMQ State:**
  - While queues may be declared durable, RabbitMQ runs as a single broker without cluster quorum or mirroring.
  - If the RabbitMQ container crashes, in-flight asynchronous events (`OrderCreatedEvent`, `PaymentCompletedEvent`) that were not yet acknowledged or persistent are permanently destroyed.

---

## 3. Point-in-Time Recovery (PITR) & Archiving Feasibility

Point-in-Time Recovery is the ability to restore a database to its exact state at any designated second (e.g. 1 minute prior to an accidental `DROP TABLE` or catastrophic ransomware corruption).

### 3.1 PostgreSQL PITR Feasibility: **ZERO**
- PostgreSQL requires two components for PITR:
  1. Base filesystem backups.
  2. Continuous WAL (Write-Ahead Logging) archiving (`archive_mode = on`, `archive_command = 'cp %p /mnt/wal_archive/%f'`).
- In the MaSoVa configuration:
  - `archive_mode` defaults to `off`.
  - No archive storage location is configured.
  - WAL segments are recycled immediately upon checkpoint.
  - PITR is technically impossible.

### 3.2 MongoDB PITR Feasibility: **ZERO**
- MongoDB requires continuous streaming of the oplog.
- Because MongoDB is deployed standalone without replica set initialization, no oplog is created.
- PITR is technically impossible.

---

## 4. Disaster Recovery Scenarios & Blast Radius Analysis

The Board simulated three standard real-world disaster scenarios against the current MaSoVa deployment topology:

```
+----------------------------------------------------------------------------------------------------+
| SCENARIO 1: Host Disk Corruption / Power Loss                                                      |
| Event: Dell host or Cloud Run host storage corruption.                                             |
| Consequence: Immediate, permanent loss of all databases. Zero backups exist in GCS or S3.          |
| Platform Status: TOTAL LIQUIDATION. No restoration possible.                                       |
+----------------------------------------------------------------------------------------------------+
| SCENARIO 2: Ransomware / Malicious Container Breach                                                |
| Event: Attacker gains container execution via Gateway bypass and executes DROP DATABASE.          |
| Consequence: Both PostgreSQL and MongoDB wiped. No immutable or air-gapped snapshots exist.        |
| Platform Status: FATAL SHUTDOWN. Operational data unrecoverable.                                   |
+----------------------------------------------------------------------------------------------------+
| SCENARIO 3: Hardware Failure During Friday Evening Dinner Rush                                     |
| Event: Host node crashes under peak load at 19:30 on Friday.                                       |
| Consequence: No hot standby or multi-zone failover exists. Manual re-provisioning required.        |
| Platform Status: EXTENDED DOWNTIME. RTO exceeds 24 hours (manual rebuild). All in-flight orders    |
| lost; restaurants unable to bill diners or process deliveries.                                     |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Mandatory Disaster Recovery Prerequisites for Go-Live

The platform cannot be certified for commercial operations until the following production infrastructure is engineered, deployed, and verified via live fire-drills:

1. **Managed Multi-AZ Cloud Databases:**
   Migrate all persistence away from single-node Docker containers to managed cloud services (e.g., Google Cloud SQL for PostgreSQL with High Availability failover and MongoDB Atlas dedicated clusters in multi-region EU setup).
2. **Continuous WAL & Oplog Archiving:**
   Configure automated continuous WAL archiving to an immutable Google Cloud Storage bucket with Object Versioning and Object Retention Lock enabled (WORM storage).
3. **Automated RPO / RTO Guardrails:**
   - Enforce an RPO of $\le 1 \text{ minute}$ via continuous transaction logging.
   - Enforce an automated failover RTO of $\le 2 \text{ minutes}$ via cloud managed health probes.
4. **Disaster Recovery Automation & Drills:**
   Commit automated restore verification scripts (`scripts/dr/verify_restore.sh`) that spin up a test database from backup every night, verify checksum integrity, and execute synthetic data queries.

---

**Board Certification Conclusion:** **REJECT**. Operating without functional database backups and DR infrastructure is gross technical negligence.

