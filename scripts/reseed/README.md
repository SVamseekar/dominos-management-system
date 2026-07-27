# Demo reseed / data repair (Dell)

**Date verified:** 2026-07-09  

## Important: two Mongos on Dell

| Instance | Port | Used by Spring? |
|---|---|---|
| **Windows `mongod` service** | `localhost:27017` | **Yes** — live demo data |
| Docker `masova-mongodb` | also maps 27017 when host mongo is stopped | Empty if host mongo owns the port |

Always run mongosh against the **host**:

```text
C:\Users\Vamsee\AppData\Local\Programs\mongosh\mongosh.exe
```

## Current demo dataset (DOM001 Berlin, EU)

After 2026-07-09 repair:

| Entity | Count | Notes |
|---|---|---|
| Stores | 3 | DOM001 Berlin DE/EUR, + DOM002/DOM003 |
| Menu | 102 | Multi-cuisine + European expansion + elegant `/images/menu/*` photos (EUR cents) |
| Staff users | 6+ | `*.berlin@gmail.com` / `Demo@1234` |
| Customers | 5 | same password `Demo@1234` |
| Orders | 142 | `customerId` = **userId** (JWT `sub`); statuses diversified |
| Inventory | 20 | |
| Delivery trackings | 34 | |
| Suppliers | 5 in Mongo | API list may still return empty if field mapping drift — use Mongo until fixed |

## Scripts

| Script | Purpose |
|---|---|
| **`reseed-all.js`** | **Phase E full EU reseed** — core → commerce → payment → logistics → intelligence |
| **`verify-seed.js`** | **Phase E exit criteria** — counts + ownership + analytics; exit 0 = green |
| `seed-core.js` | `POST /api/test-data/seed-demo` (Berlin DE/EUR, EU E.164 phones, users, campaigns) |
| `seed-commerce.js` | `POST /api/orders/seed-demo` (menu + multi-status orders + equipment) |
| `seed-payment.js` | `POST /api/payments/seed-demo` (synthetic EUR/Stripe-shaped txs + refunds) |
| `seed-logistics.js` | `POST /api/inventory/seed-demo` (suppliers, inventory, POs, waste, delivery) |
| `seed-intelligence.js` | `POST /api/analytics/seed-demo` (clear Redis + warm dashboard; no owned entities) |
| `mongo-fix-demo.js` | Diversify order statuses; ensure DOM001 EU fields (legacy repair) |
| `mongo-link-orders-userid.js` | Set `orders.customerId` = `customers.userId` for gateway ownership |
| `verify-orders-delivery-e2e.js` | **True E2E orders/delivery** — create → kitchen → dispatch → accept → OTP → DELIVERED + cancel path + SockJS check |
| `verify-payments-refunds-e2e.js` | **True E2E payments/refunds** — EU/Stripe initiate, refunds, agent approval gate |
| `verify-analytics-notifications-e2e.js` | **True E2E analytics/notifications** — BI dashboards, notifications, suppliers/equipment/shifts |

### Phase E — Full platform reseed + backend load (one path)

```bash
# Mac → Dell. Requires services on spring profile dev|demo + host Mongo + RabbitMQ + Redis.
GW=http://192.168.50.88:8080 node scripts/reseed/reseed-all.js
GW=http://192.168.50.88:8080 node scripts/reseed/verify-seed.js
# Heavy traffic + AMQP:
GW=http://192.168.50.88:8080 CONCURRENCY=40 REQUESTS=800 \
  RABBIT_MGMT=http://192.168.50.88:15672 \
  node scripts/reseed/verify-backend-load.js
# Exit 0 = green. Safe to run reseed-all twice (idempotent upserts).
```

**Idempotency:** seeders upsert by fixed keys (email, orderNumber `SEED-ORD-*`, supplierCode `SEED-SUP-*`, itemCode, notes `seed:*`). No wipe-and-replace required. Re-running resets demo passwords to `Demo@1234` and refreshes seed rows.

**Cross-service links:** reseed passes commerce paid order Mongo ids → payment txs; deliveryTracking order Mongo ids → logistics `delivery_trackings.orderId` (not order numbers).

**Ownership invariant:** commerce seed sets `order.customerId` = Anna's **userId** (JWT `sub`), not the Customer document `_id`.

**EU primary (not India):** stores `countryCode=DE` / `currency=EUR` / `locale=de-DE`; user phones E.164 `+49…`; analytics business calendar `Europe/Berlin` (not IST). Payment seed uses EUR + Stripe-shaped synthetic data.

**Intelligence:** has **no Mongo entities** — seed clears Redis analytics caches and warms staff-leaderboard / sales / BI from commerce order data so manager Analytics tab is ready.

**RabbitMQ (high traffic):** services use prefetch 50, concurrent consumers 4–16, publisher confirms + returns, DLX → `masova.dlq`. Load script verifies topology via management API `:15672` and bursts order creates that publish `order.created`.

**Resilience:** Resilience4j circuit breakers on inter-service Feign/RestTemplate; gateway `RateLimitingFilter` (per-route RPM + login lockout). Load test treats HTTP 429 as controlled protection, not a hard failure.

**Profile gate:** seed controllers/services only work when `SPRING_PROFILES_ACTIVE` includes `dev` or `demo`. Outside those profiles endpoints return 404 (or controller beans are not loaded for core `TestDataController`).

### Orders/delivery verify (Mac → Dell gateway)

```bash
GW=http://192.168.50.88:8080 node scripts/reseed/verify-orders-delivery-e2e.js
# Exit 0 = all green. Requires commerce + logistics on latest main.
```

**KDS WebSocket:** set `VITE_WS_URL=http://192.168.50.88:8084/ws`  
Health: `curl http://192.168.50.88:8084/ws/orders/info` → `{"websocket":true}`  
**Driver auto-pool:** `PATCH /api/delivery/driver/{id}/status` body `{"status":"AVAILABLE"}` before auto-dispatch (manual preferredDriverId still works offline).

### Run repair on Dell

```powershell
cd D:\Projects\masova-platform
& "$env:LOCALAPPDATA\Programs\mongosh\mongosh.exe" --quiet .\scripts\mongo-fix-demo.js
& "$env:LOCALAPPDATA\Programs\mongosh\mongosh.exe" --quiet .\scripts\mongo-link-orders-userid.js
```

## Login smoke

```powershell
curl.exe -X POST http://127.0.0.1:8080/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"manager.berlin@gmail.com\",\"password\":\"Demo@1234\"}"
curl.exe -X POST http://127.0.0.1:8080/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"anna.mueller@gmail.com\",\"password\":\"Demo@1234\"}"
```

## Demo staff PINs (POS / clock-in) — Phase F

After `reseed-all` (core seed), every Berlin staff user has a **fixed 5-digit PIN** (dev/demo only):

| Email | Role | PIN |
|---|---|---|
| `cashier.berlin@gmail.com` | CASHIER | **12345** |
| `kitchen.berlin@gmail.com` | KITCHEN | **23456** |
| `manager.berlin@gmail.com` | MANAGER | **34567** |
| `assistant.berlin@gmail.com` | ASSISTANT_MANAGER | **45678** |
| `driver.berlin@gmail.com` | DRIVER | **56789** |

Password for all demo users remains `Demo@1234`.

**POS place-order:** open `/pos`, add items, fill customer, click Place Order → enter cashier PIN `12345`.

**PIN API check:**

```bash
curl -s -X POST http://192.168.50.88:8080/api/auth/validate-pin \
  -H "Content-Type: application/json" \
  -d '{"pin":"12345"}'
```

EU payment methods (store `countryCode=DE`): **CASH / CARD / WALLET** only — UPI is India-only in the POS and customer payment UI.

## Phase F — Frontend smoke (Playwright)

From `frontend/` with Dell gateway reachable and Vite on `:3000`:

```bash
# Point API at Dell (or use .env)
export VITE_API_GATEWAY_URL=http://192.168.50.88:8080/api
export VITE_API_BASE_URL=http://192.168.50.88:8080
npx playwright test tests/phase-f-platform-smoke.spec.ts --project=chromium
```

Covers: landing, legal pages, manager dashboard + analytics + orders, customer menu/login, KDS, POS (no UPI).

## Env must-haves

- `JWT_SECRET` = non-denylisted secret (≥64 chars), **same for all services**
- `RAZORPAY_ENABLED=false` (EU primary / Stripe)
- `SPRING_PROFILES_ACTIVE=dev`
- Rabbit: `masova` / `masova_secret`

## Payments & refunds (EU / Stripe)

### Dell env (payment-service — **never commit secrets**)

```powershell
# EU primary — leave Razorpay off
$env:RAZORPAY_ENABLED = "false"

# Stripe test mode (Dashboard → Developers → API keys)
$env:STRIPE_SECRET_KEY = "sk_test_..."
$env:STRIPE_PUBLISHABLE_KEY = "pk_test_..."
$env:STRIPE_WEBHOOK_SECRET = "whsec_..."   # from Stripe CLI or Dashboard webhook endpoint
```

### Stripe webhook (local Dell)

```text
# On a machine with Stripe CLI logged in:
stripe listen --forward-to http://192.168.50.88:8089/api/payments/webhook/stripe
# Use the printed whsec_… as STRIPE_WEBHOOK_SECRET, restart payment-service
```

Gateway public path: `POST /api/payments/webhook/stripe` (no JWT; signature verified in `StripeGateway`).

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

### Canonical payment/refund routes

| Need | Path |
|---|---|
| List store transactions | `GET /api/payments?storeId=DOM001` (or `X-Selected-Store-Id`) |
| Legacy list | `GET /api/payments/store?storeId=DOM001` |
| Initiate DE Stripe | `POST /api/payments/initiate` with `countryCode=DE`, `currency=EUR` |
| Cash POS | `POST /api/payments/cash` (TAKEAWAY/PICKUP only) |
| List refunds | `GET /api/payments/refund?storeId=DOM001` |
| Plural alias | `GET /api/payments/refunds?storeId=…` |
| Gateway alias | `GET /api/refunds?storeId=…` → rewrites to `/api/payments/refund` |
| Pending agent queue | `GET /api/payments/refund?storeId=DOM001&status=PENDING_APPROVAL` |
| Manager refund | `POST /api/payments/refund` |
| Agent request (no money) | `POST /api/payments/refund/request` → `PENDING_APPROVAL` |
| Approve / reject | `POST /api/payments/refund/{id}/approve` \| `…/reject` |
| Dev seed (≥3 txs + refunds) | `POST /api/payments/seed-demo?storeId=DOM001` (`dev`/`demo` profile; manager JWT). Legacy: `/api/payments/test-data/seed-demo` |

### India (Razorpay) path — only when testing IN

```powershell
$env:RAZORPAY_ENABLED = "true"
$env:RAZORPAY_KEY_ID = "rzp_test_..."      # never use denylisted leaked keys
$env:RAZORPAY_KEY_SECRET = "..."
$env:RAZORPAY_WEBHOOK_SECRET = "..."
# Store countryCode must be IN (or null legacy). EU stores stay DE → Stripe.
```

### Payments/refunds verify (Mac → Dell)

```bash
GW=http://192.168.50.88:8080 node scripts/reseed/verify-payments-refunds-e2e.js
# Exit 0 = green. Works with synthetic seed+cash if Stripe test keys are not set.
```

## Frontend contracts (manager lists / filters)

After UI bugs like “TOTAL ORDERS 8 but No orders found”, run:

```bash
GW=http://192.168.50.88:8080 node scripts/reseed/verify-frontend-contracts.js
```

Asserts canonical `GET /orders?storeId=DOM001` (not `/orders/store`), kitchen queue, analytics, inventory, menu, kiosks, and dual-source consistency.
