# MSB-003 — European Multi-Store Chain Readiness Audit
## Document 06: Event-Driven Architecture & Message Consistency Audit

**Target Enterprise:** European Restaurant Chain (100 Stores, High-Volume Event Mesh)  
**Evaluator:** Principal Distributed Systems Architect & CTO  
**Scope:** `OrderEventPublisher`, `MaSoVaRabbitMQConfig`, Consumers across all microservices  
**Confidence Classification:** `[VERIFIED]` (Derived from AMQP configuration and publisher/consumer implementations)  
**Verdict:** **HIGH DATA LOSS RISK (ABSENCE OF TRANSACTIONAL OUTBOX & IDEMPOTENCY)**  

---

### 1. Enterprise Event Dependency Graph

In an enterprise restaurant platform, business events govern the real-time lifecycle of customer orders, kitchen workflows, delivery dispatch, inventory decrement, and financial accounting.

```
+---------------------------------------------------------------------------------------------------------+
|                                    MASOVA EVENT LIFECYCLE FLOW                                          |
+---------------------------------------------------------------------------------------------------------+
| [commerce-service]                                                                                      |
|   Order created / paid                                                                                  |
|         │                                                                                               |
|         ▼                                                                                               |
|   OrderEventPublisher.java (L24-32)                                                                     |
|         │  try { rabbitTemplate.convertAndSend(...) } catch (Exception e) { log.error(...); }           |
|         │  ** CRITICAL FLAW: Swallowed exception on network drop -> PERMANENT EVENT LOSS!               |
|         ▼                                                                                               |
|   [RabbitMQ: orders.exchange] (Topic Exchange)                                                          |
|         │                                                                                               |
|         ├── routingKey: order.created                                                                   |
|         │        ├──> [Queue: inventory.order.created]  ──> Decrement stock in logistics-service        |
|         │        ├──> [Queue: notification.order.created] -> Send email/SMS notification               |
|         │        └──> [Queue: analytics.order.created]   ──> Ingest into intelligence-service          |
|         │                                                                                               |
|         └── routingKey: order.status.changed                                                            |
|                  ├──> [Queue: kitchen.status.update]    ──> WebSocket push to KDS screens               |
|                  └──> [Queue: logistics.status.update]  ──> Driver tracking updates                    |
+---------------------------------------------------------------------------------------------------------+
```

---

### 2. Failure Mode Analysis: The 9 Core Event Questions

#### Question 1: Can an event be lost?
**YES. FREQUENTLY AND SILENTLY.**
* **Source Evidence:** In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderEventPublisher.java`:
```java
23:     public void publishOrderCreated(OrderCreatedEvent event) {
24:         try {
25:             rabbitTemplate.convertAndSend(
26:                     MaSoVaRabbitMQConfig.ORDERS_EXCHANGE,
27:                     MaSoVaRabbitMQConfig.ORDER_CREATED_KEY,
28:                     event);
29:             log.info("[AMQP] Published OrderCreatedEvent orderId={}", event.getOrderId());
30:         } catch (Exception e) {
31:             log.error("[AMQP] Failed to publish OrderCreatedEvent orderId={}: {}", event.getOrderId(), e.getMessage());
32:         }
33:     }
```
* **Failure Trace:** The method `publishOrderCreated()` executes after the order is saved to MongoDB. If RabbitMQ is undergoing maintenance, experiencing socket timeout, or buffer exhaustion:
  1. `rabbitTemplate.convertAndSend()` throws an `AmqpException`.
  2. The `catch (Exception e)` block catches the error and merely logs an error string.
  3. The method returns cleanly. The HTTP caller receives `201 CREATED`.
  4. The order exists in MongoDB, but **no event was ever delivered**.
  5. Downstream listeners never receive the event. Stock is never reserved, kitchen displays never show the ticket, and analytics are permanently desynchronized.

#### Question 2: Can an event be delivered twice?
**YES. RabbitMQ guarantees at-least-once delivery, not exactly-once.**
* If a consumer crashes after processing an order but before sending an AMQP `ack`, RabbitMQ requeues the unacknowledged message and delivers it to another consumer instance.

#### Question 3: Can an event arrive out of order?
**YES.**
* In a multi-threaded consumer setup or during consumer requeuing, `OrderStatusChangedEvent` for `BAKED` can arrive before `OrderStatusChangedEvent` for `PREPARING`. Because consumer listeners lack Lamport timestamps, state transitions can regress.

#### Question 4: Is there an Outbox Pattern?
**NO. TOTAL ABSENCE OF TRANSACTIONAL OUTBOX.**
* A proper distributed systems architecture writes the business entity and the outgoing event payload atomically into an `outbox` table within the same ACID transaction (e.g. using Debezium CDC or an outbox poller).
* In MaSoVa, database write and message publishing are completely decoupled. The database commit happens first; if the publish fails, the event vanishes into the ether.

#### Question 5: Is there consumer-side idempotency?
**NO.**
* Consumers across `logistics-service` and `intelligence-service` do not check a deduplication table (`processed_events`) keyed by `eventId` or `messageId`.
* Redelivery of `OrderCreatedEvent` results in **duplicate inventory decrements** in the inventory service.

#### Question 6: Is there replay capability?
**NO.**
* The architecture relies on RabbitMQ queues without Apache Kafka event log retention or an event store. Once a message is acknowledged, it is removed from the broker. If a microservice database is restored from backup, previous business events cannot be replayed to rebuild state.

#### Question 7: Is there Dead-Letter Handling (DLQ)?
**PARTIAL BUT UNMANAGED.**
* While `MaSoVaRabbitMQConfig` configures `x-dead-letter-exchange` on selected queues, there are no automated DLQ monitoring alerts, no consumer retry backoff policies with exponential jitter, and no operational tooling to inspect and replay poisoned messages.

#### Question 8: Can a consumer partially process an event?
**YES.**
* Multi-step consumer tasks (e.g. decrementing 5 recipe ingredients for a pizza in inventory) execute without relational transaction boundaries across MongoDB and relational stores. If the 3rd ingredient update fails, the first two remain decremented, creating inventory drift.

#### Question 9: Can a store become permanently inconsistent?
**YES.**
* A single dropped `OrderCreatedEvent` or duplicate `OrderStatusChangedEvent` causes the physical restaurant kitchen, customer mobile app, and inventory ledger to diverge permanently.

---

### 3. The Logistics Listener Gap

A critical discovery in `logistics-service`:
* There is **no `@RabbitListener`** configured to listen for `OrderCreatedEvent` to automatically generate delivery tracking and dispatch drivers.
* Orders must be manually dispatched via a frontend button click calling `POST /api/delivery/dispatch`.
* If staff at Store A fail to manually trigger dispatch, or if third-party aggregator orders (UberEats, Deliveroo) are ingested via API, delivery orders sit indefinitely without driver assignment.

---

### 4. CTO Verdict on Event Consistency

The event messaging infrastructure lacks basic distributed systems guarantees:
1. Swallowed publishing exceptions cause silent order loss.
2. Complete absence of a Transactional Outbox.
3. Zero consumer idempotency, causing inventory double-deductions upon redelivery.
4. No event replay capabilities.

**Event Consistency Readiness: CRITICAL FAILURE / BLOCKED**
