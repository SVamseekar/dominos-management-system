# MSB-003 — European Multi-Store Chain Readiness Audit
## Document 07: Dual-Database Consistency & Data Integrity Audit

**Target Enterprise:** European Restaurant Chain (100 Stores, High-Concurrency Financial Ledgers)  
**Evaluator:** Principal Database Architect & CTO  
**Scope:** PostgreSQL (`masova_dev`), MongoDB, JPA Repositories, Dual-Write Interceptors  
**Confidence Classification:** `[VERIFIED]` (Validated against data access layers and dual-write services)  
**Verdict:** **ARCHITECTURAL SPLIT-BRAIN (INVERTED DUAL-WRITES & UNPOPULATED RELATIONAL SCHEMAS)**  

---

### 1. The Dual-Database Strategy: Design vs. Reality

MaSoVa attempts a hybrid persistence model:
* **MongoDB:** Used as the operational document store for JSON flexibility and real-time state.
* **PostgreSQL:** Designated as the relational, audit-compliant system of record for financial reporting, BI, and long-term analytics.

However, an enterprise audit of the data access layer reveals that the dual-write implementation suffers from an **inverted priority antipattern**, lacks distributed transaction boundaries, and completely abandons PostgreSQL in the payment domain.

```
+----------------------------------------------------------------------------------------------------+
|                                    INVERTED DUAL-WRITE ANTIPATTERN                                 |
+----------------------------------------------------------------------------------------------------+
| Client Request                                                                                     |
|       │                                                                                            |
|       ▼                                                                                            |
| [OrderService.java]                                                                                |
|       │                                                                                            |
|       ├── (1) PRIMARY WRITE: MongoRepository.save(order)                                           |
|       │       --> Writes JSON document to MongoDB                                                  |
|       │       --> STATUS: COMMITTED                                                                |
|       │                                                                                            |
|       └── (2) SECONDARY WRITE: OrderItemSyncService.syncOrderItems(pgOrder, order)                 |
|               --> Wrapped in try / catch (Exception e)                                             |
|               --> If PostgreSQL connection pool exhausted or disk full:                            |
|                   - Logs error: "Failed to sync order to PostgreSQL"                               |
|                   - SWALLOWS EXCEPTION                                                             |
|                   - RETURNS HTTP 200/201 SUCCESS TO CLIENT                                         |
|                                                                                                    |
| RESULT: MongoDB and PostgreSQL permanently desynchronized. No reconciliation job exists!           |
+----------------------------------------------------------------------------------------------------+
```

---

### 2. Dual-Write Inventory Across Microservices

| Microservice | Authoritative Store in Code | Write Order | Transaction Boundary | Failure Handling | Stale Data / Drift Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`commerce-service`** (Orders) | **MongoDB** (`orderRepository`) | 1. MongoDB<br>2. PostgreSQL | **None** (Non-distributed; Mongo outside JPA TX) | Swallows JPA exception; logs error. | **CRITICAL**: Orders exist in Mongo but missing from relational accounting. |
| **`core-service`** (Users / Customers) | **MongoDB** (`userRepository`) | 1. MongoDB<br>2. PostgreSQL | **None** | Swallows JPA exception; logs warning. | **HIGH**: Customer accounts desynchronize; login succeeds but relational profile missing. |
| **`payment-service`** (Payments / Refunds) | **MongoDB ONLY** (`transactionRepo`) | **MongoDB Only** (PostgreSQL never called) | **None** | **ZERO JPA ENTITIES** in payment service. | **FATAL**: PostgreSQL `payment_schema` is 100% empty and abandoned. |
| **`logistics-service`** (Deliveries) | **MongoDB** (`deliveryTrackingRepo`) | 1. MongoDB<br>2. PostgreSQL | **None** | Swallows JPA exception. | **HIGH**: Dispatch records drift between dispatchers and drivers. |
| **`intelligence-service`** (Analytics) | **Read-Only / In-Memory** | Queries MongoDB or calls REST APIs | **N/A** | Swallows RestClientExceptions; fallback returns empty lists. | **HIGH**: Executive summaries report partial or zero data. |

---

### 3. The Phantom Payment Schema in PostgreSQL

In enterprise financial engineering, payment transactions and tax records must reside in an ACID-compliant relational ledger capable of strict foreign keys, immutable audit trails, and strict transaction isolation.

#### Forensic Discovery in `payment-service`:
1. The database initialization script (`docker/postgres/init-schemas.sql`) creates a dedicated schema:
   ```sql
   CREATE SCHEMA IF NOT EXISTS payment_schema;
   CREATE TABLE payment_schema.transactions (...);
   CREATE TABLE payment_schema.refunds (...);
   ```
2. A search across `payment-service/src/main/java` for `@Entity`, `JpaRepository`, or `EntityManager` returns **EXACTLY ZERO RESULTS**.
3. In `payment-service/pom.xml`, Spring Data JPA is either unconfigured or unused.
4. All payment transactions, Stripe payment intents, card tokens, and refund records are saved **exclusively to MongoDB** via `TransactionRepository` and `RefundRepository`.
5. **Consequence:** The PostgreSQL `payment_schema` sits completely unpopulated in production. Any financial auditing or BI tool connecting to PostgreSQL will find zero transactions and zero revenue records.

---

### 4. Absence of Distributed Sagas or Reconciliation

In distributed architectures where dual writes are unavoidable, systems must implement either:
* **The Saga Pattern:** Orchestrated or choreographed compensating transactions to roll back Step 1 if Step 2 fails.
* **Asynchronous Change Data Capture (CDC):** Write only to the primary database and stream changes to the secondary store via Debezium and Kafka.
* **Scheduled Reconciliation Batch Jobs:** Nightly jobs comparing primary and secondary records, flagging variances and healing broken rows.

#### Code Audit Findings:
* **Zero Sagas:** If PostgreSQL fails during `syncOrderItems()`, MongoDB is never rolled back. The customer receives an order confirmation, but the relational system has no record of it.
* **Zero CDC:** No Debezium connectors or Kafka streaming pipelines exist.
* **Zero Reconciliation Tooling:** There is no batch reconciliation job in `commerce-service` or `core-service` that scans MongoDB and PostgreSQL to detect and heal drifted records.

---

### 5. Dual-Database Viability at 100-Store Enterprise Scale

Running 100 stores with thousands of concurrent transactions across uncoordinated dual databases introduces fatal operational overhead:
1. **Connection Pool Starvation:** Every service must maintain two separate connection pools (HikariCP for PostgreSQL, Mongo Driver for MongoDB). During peak load, connection exhaustion in one database blocks threads servicing the other.
2. **Double Backup & Recovery Desynchronization:** If an operational disaster occurs and MongoDB is restored from a backup taken at 02:00 while PostgreSQL is restored from a backup taken at 02:15, the entire system enters permanent split-brain. Re-linking foreign keys across databases requires weeks of manual data engineering.
3. **Split-Brain Disaster:** Because the primary write is MongoDB, any corporate governance requirement relying on PostgreSQL as the "single source of truth" is completely compromised.

---

### 6. CTO Verdict on Database Consistency

The dual-write architecture is an **unstable, non-transactional antipattern**. MongoDB is treated as the primary store while PostgreSQL is updated via best-effort, failure-swallowed secondary calls, leaving the relational enterprise ledger incomplete and fragmented.

**Database Consistency Readiness: CRITICAL FAILURE / BLOCKED**
