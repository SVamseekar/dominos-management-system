# Document 07 — Database Architecture & Resilience Engineering Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** PostgreSQL 15, MongoDB 6, Redis 7, RabbitMQ 3, Spring Data Dual-Write
**Evaluator:** Independent Go-Live Board (Production Engineering, Database Architecture, Reliability)
**Date:** September 2026
**Status:** **REJECTED (ARCHITECTURAL DIVERGENCE & RESILIENCE FAILURES)**

---

## 1. Executive Summary & Architecture Overview

The MaSoVa platform employs a polyglot persistence model consisting of four foundational stateful systems:
1. **PostgreSQL 15 (`postgres:15-alpine`):** Intended as the authoritative relational system of record for accounts, fiscal records, dual-write orders, and billing.
2. **MongoDB 6.0 (`mongo:6.0`):** Operates as the active operational document store for customer carts, orders, delivery tracking, and payment transactions.
3. **Redis 7.0 (`redis:7-alpine`):** Utilized for JWT token revocation blacklists, cart caching, and rate limiting counters.
4. **RabbitMQ 3.12 (`rabbitmq:3-management`):** Acts as the asynchronous event bus connecting domain events (`order.created`, `payment.completed`, `delivery.dispatched`).

The engineering team claims high availability and data durability. However, empirical analysis of the persistence layer reveals **uncoordinated dual-writes**, **swallowed synchronization exceptions**, **lack of distributed transactions or CDC**, and **severe failure blast radiuses**.

```
+----------------------------------------------------------------------------------------------------+
|                                    PERSISTENCE RESILIENCE AUDIT                                    |
+--------------------------+-------------------------+-----------------------------------------------+
| Storage Engine           | Role / Mode             | Key Failure Risk                              |
+--------------------------+-------------------------+-----------------------------------------------+
| PostgreSQL 15            | Relational System       | HikariCP connection starvation; silent sync   |
| MongoDB 6.0              | Operational Docs        | Uncoordinated writes; no cross-store rollback |
| Redis 7.0                | Token & Cache           | Fail-open auth vulnerability on outage        |
| RabbitMQ 3.12            | Async Event Mesh        | At-most-once publisher drops; no DLQ replay   |
| Dual-Write Strategy      | Application try-catch   | Permanent silent divergence between stores    |
+--------------------------+-------------------------+-----------------------------------------------+
```

---

## 2. The Four-Database Failure Matrix

The Board evaluated the exact system behaviors when each datastore encounters an outage, network partition, or failover.

### 2.1 PostgreSQL Failure Mode
- **Services Affected:** `core-service`, `commerce-service`, `logistics-service`.
- **Observed Behavior:**
  - In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java` lines 303–305:
    ```java
    try {
        orderJpaRepository.save(jpaEntity);
    } catch (Exception e) {
        log.warn("PostgreSQL dual-write failed for order {}: {}", savedOrder.getOrderNumber(), e.getMessage());
    }
    ```
    If PostgreSQL crashes, restarts, or maxes out connections, `commerce-service` catches the exception, logs a warning, and continues. The order exists in MongoDB, but is completely missing from PostgreSQL.
  - In `core-service`, user authentication and staff lookup query PostgreSQL directly. When PostgreSQL is down, staff login and JWT token validation completely fail.
- **Write-Loss & Recovery:** No write-ahead replay queue exists. The missed relational writes are lost forever, corrupting fiscal and accounting ledgers.

---

### 2.2 MongoDB Failure Mode
- **Services Affected:** Entire ecosystem (`commerce-service`, `payment-service`, `logistics-service`, `intelligence-service`).
- **Observed Behavior:**
  - Because MongoDB is the primary operational datastore for active checkouts, restaurant menus, and payment transactions, any MongoDB failure completely halts the checkout and payment pipeline.
  - In `payment-service`, `TransactionRepository` is purely a `MongoRepository`. Inability to reach MongoDB causes incoming Stripe webhooks to fail with HTTP 500.
  - Transactions cannot be created; payment verification fails.

---

### 2.3 Redis Failure Mode (The Fail-Open Auth Vulnerability)
- **Services Affected:** `api-gateway`, `core-service`, Web Frontend, Mobile Clients.
- **Observed Behavior:**
  - Redis maintains revoked JWT tokens (`revoked_token:<jti>`).
  - As detailed in Document 03, the Redis client in `TokenRevocationService.java` handles `RedisConnectionFailureException` by catching the exception and returning `false` (i.e. "token is not revoked").
  - Under a Redis outage, every revoked, stolen, or compromised administrative token is immediately treated as valid by the gateway, granting unauthorized actors full administrative access.
  - Shopping carts stored in Redis are wiped if memory persistence (AOF/RDB) is not fsynced immediately.

---

### 2.4 RabbitMQ Failure Mode
- **Services Affected:** Asynchronous event delivery between order creation, kitchen display, driver dispatch, and analytics.
- **Observed Behavior:**
  - In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java` lines 308–312:
    ```java
    try {
        orderEventPublisher.publishOrderCreated(OrderEventBuilder.buildOrderCreatedEvent(savedOrder));
    } catch (Exception e) {
        log.warn("Failed to publish order created event for {}: {}", savedOrder.getOrderNumber(), e.getMessage());
    }
    ```
    If RabbitMQ is unavailable or saturated, the order creation event is silently dropped with a warning log.
  - `logistics-service` never learns of the order; `intelligence-service` misses real-time analytics; kitchen displays miss the order.
  - There is no Transactional Outbox pattern implemented in `commerce-service`. The event cannot be re-published once RabbitMQ recovers.

---

## 3. The Dual-Write Architectural Fallacy

A distributed dual-write between two different database technologies (MongoDB document model vs. PostgreSQL relational tables) without a two-phase commit (2PC) or Change Data Capture (CDC via Debezium/Kafka) guarantees eventual data inconsistency.

```
       +---------------------------------------------+
       |           Customer Checkout Request         |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |   Step 1: Write to MongoDB (orderRepository)|  <=== SUCCESS
       +---------------------------------------------+
                              |
                     [ Network Glitch ]
                              |
                              v
       +---------------------------------------------+
       |   Step 2: Write to PostgreSQL (orderJpaRepo)|  <=== FAILS (Caught & Swallowed)
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |   Step 3: Publish to RabbitMQ (EventBus)    |  <=== SUCCESS
       +---------------------------------------------+
```

### 3.1 Unrecoverable State Divergence
1. **No Distributed Transaction Coordinator:**
   Spring Boot's `@Transactional` on `OrderService.createOrder` manages either the JPA transaction manager or Mongo transaction manager, but cannot atomically coordinate both without XA/JTA protocols.
2. **Asymmetrical State Changes:**
   When orders are updated (e.g. status changes to `PREPARING`, `READY`, `DELIVERED`), updates are applied only to MongoDB. PostgreSQL `commerce_schema.orders` contains stale `RECEIVED` records.
3. **No Reconciliation Tooling:**
   The repository contains zero background reconciliation jobs, zero checksum verifiers, and zero divergence alerting scripts. The two databases diverge silently over time.

---

## 4. Connection Pool Starvation & Sizing Mismatch

In a containerized microservices environment, connection pool limits must be coordinated against database instance ceilings.

### 4.1 PostgreSQL HikariCP Exhaustion Analysis
- **PostgreSQL Default Limit:** Standard PostgreSQL 15 running in container allocates `max_connections = 100` (with 3 reserved for superuser).
- **Microservices Pool Allocations:**
  - `core-service`: `maximum-pool-size: 30`
  - `commerce-service`: `maximum-pool-size: 30`
  - `logistics-service`: `maximum-pool-size: 20`
  - `payment-service`: `maximum-pool-size: 20`
- **Cumulative Maximum:** $30 + 30 + 20 + 20 = 100$ connections.
- Under peak lunchtime traffic or horizontal scaling of service containers:
  1. Microservices consume all available PostgreSQL connections.
  2. PostgreSQL begins throwing:
     ```
     FATAL: remaining connection slots are reserved for non-replication superuser connections
     ```
  3. Flyway migrations on deployment fail to acquire connection locks.
  4. Services crash on health check probes, triggering cascading restart loops across the container fleet.

---

## 5. Multi-Tenant Data Isolation Failure

The European deployment model specifies serving multiple independent restaurant brands and franchisees.

### 5.1 Shared Database & Schema Without Row-Level Security
- In PostgreSQL, all restaurants share the exact same tables (`commerce_schema.orders`, `core_schema.customers`) differentiated solely by a nullable `store_id VARCHAR(36)`.
- PostgreSQL **Row-Level Security (RLS)** is not enabled on any table:
  ```sql
  -- MISSING IN ALL MIGRATIONS:
  ALTER TABLE commerce_schema.orders ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_policy ON commerce_schema.orders
      USING (store_id = current_setting('app.current_store_id'));
  ```
- Application code queries rely entirely on developers remembering to append `WHERE store_id = :storeId` or `findByStoreId(...)`.
- Any unparameterized query, reporting defect, or developer omission immediately leaks competitor order volume, revenue numbers, and customer names to unauthorized restaurant managers.

---

## 6. Database Resilience Go-Live Requirements

To pass production certification, the persistence architecture must undergo structural refactoring:

1. **Eliminate Swallowed Dual-Writes:**
   Deprecate direct application-level dual-writes. Establish MongoDB as the sole operational transactional store, and stream mutations to PostgreSQL asynchronously using Kafka Connect / Debezium CDC.
2. **Implement Transactional Outbox:**
   Persist all domain events (`OrderCreated`, `PaymentCompleted`) into an atomic outbox collection within the primary database transaction before dispatching to RabbitMQ.
3. **Configure Fail-Closed Security on Redis:**
   Re-architect `TokenRevocationService` to fail closed or fall back to short-lived cryptographic asymmetric token revocation checks if Redis becomes unreachable.
4. **Deploy PgBouncer Connection Pooling:**
   Introduce PgBouncer in transaction-pooling mode in front of PostgreSQL to multiplex thousands of microservice connections into a controlled backend pool of 20 connections.
5. **Enforce PostgreSQL Row-Level Security (RLS):**
   Activate RLS across all multi-tenant tables to enforce tenant isolation cryptographically at the database engine level.

---

**Board Certification Conclusion:** **REJECT**. The database persistence layer cannot sustain production failure scenarios without data loss and split-brain corruption.

