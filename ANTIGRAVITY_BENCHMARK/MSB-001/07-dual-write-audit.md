# 07 - Dual-Write Architecture Audit & Inversion Discrepancy

**Audit Date:** September 2026
**Auditor:** Antigravity Autonomous Senior Software-Engineering Agent
**Standard of Evidence:** Strict code citations (`Repository`, `File`, `Symbol`, `Line`)

---

## 1. Documented Architectural Mandate

The architectural governance rules for the MaSoVa ecosystem explicitly and repeatedly define the dual-database persistence strategy:

### 1.1 `docs/guidelines/domain-rules.md:L37`
> **Dual-Write Pattern:** Perform PostgreSQL writes synchronously first, followed by MongoDB writes asynchronously in a `try/catch` block (see **Decision D08** in [decisions.md](file:///Users/souravamseekarmarti/Projects/MaSoVa-restaurant-management-system/docs/guidelines/decisions.md)).

### 1.2 `docs/guidelines/decisions.md:L66-69` (Decision D08)
> **Decision D08: Dual-Write Database Pattern (Consistency Guarantee)**
> - **Intended Design:** PostgreSQL is the relational, transaction-safe financial source of truth. MongoDB handles document aggregates.
> - **Constraint:** All dual-write transactions (e.g., creating an order) **must** write to PostgreSQL synchronously first (within the database transaction). If that succeeds, write to MongoDB asynchronously second. Writing to MongoDB first and PostgreSQL second is **forbidden** as it exposes the transactional ledger to data loss if the Postgres write fails.

---

## 2. Source Code Reality: The Complete Inversion

A line-by-line inspection of the actual Java services reveals that the production implementation completely inverts Decision D08 across services where dual-write is implemented, and completely omits PostgreSQL in the remaining services.

### 2.1 Core Service (`core-service`)
* **File:** `core-service/src/main/java/com/MaSoVa/core/user/service/UserService.java`
* **Symbol:** `registerUser`
* **Lines:** 137–144
* **Verbatim Code:**
  ```java
  // Line 136-137: Primary write is MongoDB
  savedUser.setLastLogin(LocalDateTime.now());
  userRepository.save(savedUser);

  // Line 139-144: Secondary write to PostgreSQL is in a try/catch block!
  // Phase 2 dual-write: sync to PostgreSQL (non-blocking)
  try {
      userJpaRepository.save(toUserEntity(savedUser));
  } catch (Exception e) {
      logger.warn("PG dual-write failed for registerUser userId={}: {}", savedUser.getId(), e.getMessage());
  }
  ```
* **Audit Finding:** MongoDB is executed synchronously first as the primary persistence store. PostgreSQL write is executed second inside an open `try/catch` block where exceptions are swallowed and merely logged as warnings.

### 2.2 Commerce Service (`commerce-service`)
* **File:** `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`
* **Symbol:** `createOrder` & `syncToPostgres`
* **Lines:** 271, 470, 712–725
* **Verbatim Code:**
  ```java
  // Line 271: MongoDB save
  Order savedOrder = orderRepository.save(order);

  // Line 470: Called during updateOrderStatus
  syncToPostgres(updatedOrder);

  // syncToPostgres implementation (L712-725):
  private void syncToPostgres(Order order) {
      try {
          OrderJpaEntity entity = orderMapper.toJpaEntity(order);
          orderJpaRepository.save(entity);
      } catch (Exception e) {
          log.warn("PostgreSQL dual-write failed for order {}: {}", order.getOrderNumber(), e.getMessage());
          // Swallowed!
      }
  }
  ```
* **Audit Finding:** In direct violation of Decision D08, MongoDB is written first. If PostgreSQL fails or is unavailable, the failure is discarded, and the request succeeds.

### 2.3 Payment Service (`payment-service`)
* **Directory Audited:** `payment-service/src/main/java/`
* **JPA Entities Present:** `0`
* **JpaRepository Interfaces Present:** `0`
* **Flyway Migrations Present:** `V1__init_payment_tables.sql` exists in resources, and `docker-compose.yml` mounts a Postgres connection URL.
* **Audit Finding:** PostgreSQL is **completely absent from application code**. `payment-service` writes solely to MongoDB (`paymentTransactionRepository.save()`). All transactions exist exclusively as MongoDB documents.

### 2.4 Logistics Service (`logistics-service`)
* **Directory Audited:** `logistics-service/src/main/java/`
* **JPA Entities Present:** `0`
* **JpaRepository Interfaces Present:** `0`
* **Audit Finding:** PostgreSQL is **completely absent from application code**. Deliveries, driver coordinates, and proof-of-delivery records exist solely in MongoDB.

---

## 3. Production Failure Impact Analysis

1. **Financial Drift & Audit Non-Compliance:**
   * Because PostgreSQL is treated as an optional secondary projection in `commerce-service` and omitted entirely in `payment-service`, standard SQL-based financial audits, regulatory reporting, and tax reconciliation pipelines running against PostgreSQL will under-report revenue, miss orders whose Postgres sync threw an exception, and contain zero payment ledger entries.
2. **Missing Reconciliation Worker:**
   * There is no background reconciliation worker, Outbox sweeper, or CDC pipeline (such as Debezium) to reconcile differences between MongoDB and PostgreSQL. Once a Postgres write is swallowed in `catch (Exception e)`, the two datastores remain permanently out of sync.
3. **Broken Foreign Key References:**
   * If a user is registered in MongoDB, but the PostgreSQL write fails, subsequent relational operations attempting to link an order to that user's PostgreSQL ID will fail with foreign key violation errors.

