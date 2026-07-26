#!/usr/bin/env node
/**
 * Phase B residual — True E2E verification against live gateway (Dell).
 *
 * Covers:
 *  B1 staff create order
 *  B2 full status machine + cancel request approve/reject
 *  B3 delivery list / driver active / OTP verify
 *  B4 dispatch → accept → tracking → OTP → DELIVERED
 *  Customer-path order through DELIVERED with driver steps
 *
 * Usage:
 *   GW=http://192.168.50.88:8080 node scripts/reseed/verify-phase-b-e2e.js
 *
 * Exit 0 only if all checks pass.
 */

const GW = process.env.GW || process.env.GATEWAY_URL || 'http://192.168.50.88:8080';

const results = [];
function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

async function json(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function login(email, password = 'Demo@1234') {
  const { status, data } = await json('POST', '/api/auth/login', {
    body: { email, password },
  });
  if (status !== 200 || !data?.accessToken) {
    throw new Error(`login failed ${email}: ${status} ${JSON.stringify(data)}`);
  }
  return data.accessToken;
}

function jwtSub(token) {
  const payload = token.split('.')[1];
  const json = Buffer.from(payload + '==='.slice((payload.length + 3) % 4), 'base64').toString();
  return JSON.parse(json).sub;
}

async function advanceOrder(token, orderId, statuses) {
  for (const st of statuses) {
    const { status, data } = await json('POST', `/api/orders/${orderId}/status`, {
      token,
      body: { status: st },
    });
    if (status !== 200 || data?.status !== st) {
      throw new Error(`status ${st}: HTTP ${status} body=${JSON.stringify(data).slice(0, 150)}`);
    }
  }
}

async function main() {
  console.log(`\nPhase B E2E verify → ${GW}\n`);

  const manager = await login('manager.berlin@gmail.com');
  const driver = await login('driver.berlin@gmail.com');
  const customer = await login('anna.mueller@gmail.com');
  const driverId = jwtSub(driver);
  const customerSub = jwtSub(customer);
  ok('auth logins', `driver=${driverId.slice(0, 8)}… customer=${customerSub.slice(0, 8)}…`);

  // Driver online for auto-dispatch pool
  {
    const { status } = await json('PATCH', `/api/delivery/driver/${driverId}/status`, {
      token: driver,
      body: { status: 'AVAILABLE' },
    });
    status === 200 ? ok('driver AVAILABLE') : fail('driver AVAILABLE', String(status));
  }

  // —— POS / staff delivery with full driver path ——
  let staffOrderId;
  {
    const { status, data } = await json('POST', '/api/orders', {
      token: manager,
      body: {
        storeId: 'DOM001',
        orderType: 'DELIVERY',
        orderSource: 'MASOVA',
        customerName: 'E2E Staff Driver Path',
        customerPhone: '+491701111111',
        items: [{ menuItemId: 'm1', name: 'Margherita', quantity: 1, price: 12.0 }],
        deliveryAddress: {
          street: 'Friedrichstr 1',
          city: 'Berlin',
          pincode: '10117',
          latitude: 52.52,
          longitude: 13.405,
        },
      },
    });
    if (status === 200 || status === 201) {
      staffOrderId = data.id;
      ok('B1 staff create order', data.orderNumber || staffOrderId);
    } else {
      fail('B1 staff create order', `${status} ${JSON.stringify(data).slice(0, 120)}`);
      throw new Error('cannot continue without staff order');
    }
  }

  await advanceOrder(manager, staffOrderId, [
    'PREPARING',
    'OVEN',
    'BAKED',
    'READY',
    'DISPATCHED',
  ]);
  ok('B2 kitchen path to DISPATCHED');

  let trackingId;
  {
    const { status, data } = await json('POST', '/api/delivery/dispatch', {
      token: manager,
      headers: {
        'X-User-Store-Id': 'DOM001',
        'X-Selected-Store-Id': 'DOM001',
        'X-User-Type': 'MANAGER',
      },
      body: {
        orderId: staffOrderId,
        storeId: 'DOM001',
        preferredDriverId: driverId,
        deliveryAddress: {
          street: 'Friedrichstr 1',
          city: 'Berlin',
          zipCode: '10117',
          latitude: 52.52,
          longitude: 13.405,
        },
      },
    });
    if (status === 201 || status === 200) {
      trackingId = data.trackingId; // may be undefined — resolve from list
      ok('B4 dispatch', `driver=${data.driverId} status=${data.status}`);
    } else {
      fail('B4 dispatch', `${status} ${JSON.stringify(data).slice(0, 150)}`);
    }
  }

  {
    const { status, data } = await json('GET', '/api/delivery?storeId=DOM001', { token: manager });
    if (status === 200 && Array.isArray(data)) {
      const row = data.find((d) => d.orderId === staffOrderId);
      if (row) trackingId = row.id;
      ok('B3 GET /api/delivery', `n=${data.length} tracking=${trackingId || 'n/a'}`);
    } else {
      fail('B3 GET /api/delivery', String(status));
    }
  }

  {
    const { status, data } = await json('GET', '/api/delivery/driver/active', { token: driver });
    if (status === 200 && Array.isArray(data)) {
      ok('B3 GET /api/delivery/driver/active', `n=${data.length}`);
    } else {
      fail('B3 GET /api/delivery/driver/active', String(status));
    }
  }

  if (trackingId) {
    const { status, data } = await json('POST', '/api/delivery/accept', {
      token: driver,
      body: { trackingId, driverId },
    });
    status === 200 && data?.status === 'ACCEPTED'
      ? ok('B4 driver accept')
      : fail('B4 driver accept', `${status} ${JSON.stringify(data).slice(0, 100)}`);

    for (const st of ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED']) {
      const r = await json('POST', `/api/delivery/${trackingId}/status`, {
        token: driver,
        body: { status: st, driverId },
      });
      r.status === 200
        ? ok(`B4 tracking ${st}`)
        : fail(`B4 tracking ${st}`, String(r.status));
    }
  } else {
    fail('B4 trackingId missing', 'skip accept/tracking');
  }

  // Order OFD then OTP (tracking PICKED_UP may already sync OFD on order)
  {
    const cur = await json('GET', `/api/orders/${staffOrderId}`, { token: manager });
    const curSt = cur.data?.status;
    if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(curSt)) {
      ok('B2 order OUT_FOR_DELIVERY', `already ${curSt} (synced from tracking)`);
    } else {
      const r = await json('POST', `/api/orders/${staffOrderId}/status`, {
        token: manager,
        body: { status: 'OUT_FOR_DELIVERY' },
      });
      r.status === 200 && r.data?.status === 'OUT_FOR_DELIVERY'
        ? ok('B2 order OUT_FOR_DELIVERY')
        : fail('B2 order OUT_FOR_DELIVERY', `${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
    }
  }

  let otp;
  {
    const { status, data } = await json('POST', `/api/delivery/${staffOrderId}/otp`, {
      token: manager,
    });
    // API returns raw string body sometimes
    otp = typeof data === 'string' ? data : data?.otp || data?._raw;
    if (status === 200 && otp && String(otp).match(/^\d{4}/)) {
      otp = String(otp).replace(/\D/g, '').slice(0, 4);
      ok('B3 generate OTP', otp);
    } else {
      // order may already have OTP from DISPATCHED
      const ord = await json('GET', `/api/orders/${staffOrderId}`, { token: manager });
      otp = ord.data?.deliveryOtp;
      otp ? ok('B3 OTP from order', otp) : fail('B3 generate OTP', `${status}`);
    }
  }

  if (otp) {
    const { status, data } = await json('POST', '/api/delivery/verify', {
      token: driver,
      body: { orderId: staffOrderId, otp: String(otp), proofType: 'otp' },
    });
    status === 200 && data?.verified
      ? ok('B3 OTP verify', data.message || 'verified')
      : fail('B3 OTP verify', `${status} ${JSON.stringify(data).slice(0, 120)}`);
  }

  {
    const { status, data } = await json('GET', `/api/orders/${staffOrderId}`, { token: manager });
    data?.status === 'DELIVERED'
      ? ok('B4 staff order DELIVERED', data.orderNumber)
      : fail('B4 staff order DELIVERED', `${status} status=${data?.status}`);
  }

  // Idempotent tracking DELIVERED (after OTP already delivered)
  if (trackingId) {
    const { status } = await json('POST', `/api/delivery/${trackingId}/status`, {
      token: driver,
      body: { status: 'DELIVERED', driverId, notes: 'idempotent' },
    });
    status === 200
      ? ok('B4 tracking DELIVERED idempotent')
      : fail('B4 tracking DELIVERED idempotent', String(status));
  }

  // —— Customer path + driver steps ——
  let custOrderId;
  {
    const { status, data } = await json('POST', '/api/orders', {
      token: customer,
      body: {
        storeId: 'DOM001',
        orderType: 'DELIVERY',
        orderSource: 'MASOVA',
        customerName: 'Anna Müller',
        customerId: customerSub,
        items: [{ menuItemId: 'm1', name: 'Margherita', quantity: 1, price: 11.0 }],
        deliveryAddress: {
          street: 'Alexanderplatz 1',
          city: 'Berlin',
          pincode: '10178',
          latitude: 52.5219,
          longitude: 13.4132,
        },
      },
    });
    if ((status === 200 || status === 201) && data?.customerId === customerSub) {
      custOrderId = data.id;
      ok('customer create with JWT sub', data.orderNumber);
    } else {
      fail('customer create', `${status}`);
    }
  }

  if (custOrderId) {
    await advanceOrder(manager, custOrderId, [
      'PREPARING',
      'OVEN',
      'BAKED',
      'READY',
      'DISPATCHED',
    ]);
    const disp = await json('POST', '/api/delivery/dispatch', {
      token: manager,
      headers: {
        'X-User-Store-Id': 'DOM001',
        'X-Selected-Store-Id': 'DOM001',
        'X-User-Type': 'MANAGER',
      },
      body: {
        orderId: custOrderId,
        storeId: 'DOM001',
        preferredDriverId: driverId,
        deliveryAddress: {
          street: 'Alexanderplatz 1',
          city: 'Berlin',
          zipCode: '10178',
          latitude: 52.5219,
          longitude: 13.4132,
        },
      },
    });
    disp.status === 201 || disp.status === 200
      ? ok('customer path dispatch')
      : fail('customer path dispatch', String(disp.status));

    const list = await json('GET', '/api/delivery?storeId=DOM001', { token: manager });
    const tr = Array.isArray(list.data)
      ? list.data.find((d) => d.orderId === custOrderId)
      : null;
    if (tr) {
      await json('POST', '/api/delivery/accept', {
        token: driver,
        body: { trackingId: tr.id, driverId },
      });
      await json('POST', `/api/orders/${custOrderId}/status`, {
        token: manager,
        body: { status: 'OUT_FOR_DELIVERY' },
      });
      const otpRes = await json('POST', `/api/delivery/${custOrderId}/otp`, { token: manager });
      let cotp =
        typeof otpRes.data === 'string'
          ? otpRes.data
          : otpRes.data?._raw || otpRes.data?.otp;
      cotp = String(cotp || '').replace(/\D/g, '').slice(0, 4);
      if (!cotp) {
        const ord = await json('GET', `/api/orders/${custOrderId}`, { token: manager });
        cotp = ord.data?.deliveryOtp;
      }
      if (cotp) {
        await json('POST', '/api/delivery/verify', {
          token: driver,
          body: { orderId: custOrderId, otp: String(cotp), proofType: 'otp' },
        });
      }
      const final = await json('GET', `/api/orders/${custOrderId}`, { token: manager });
      final.data?.status === 'DELIVERED'
        ? ok('customer order DELIVERED with driver steps', final.data.orderNumber)
        : fail('customer order DELIVERED', final.data?.status);
    } else {
      fail('customer tracking not found');
    }
  }

  // —— Cancel path ——
  {
    const created = await json('POST', '/api/orders', {
      token: customer,
      body: {
        storeId: 'DOM001',
        orderType: 'TAKEAWAY',
        orderSource: 'MASOVA',
        customerName: 'Anna Cancel',
        customerId: customerSub,
        items: [{ menuItemId: 'm1', name: 'Margherita', quantity: 1, price: 9.0 }],
      },
    });
    const oid = created.data?.id;
    const req = await json('POST', `/api/orders/${oid}/cancel-request`, {
      token: customer,
      body: { reason: 'e2e reject path' },
    });
    const rej = await json('POST', `/api/orders/${oid}/cancel-request/reject`, {
      token: manager,
    });
    req.status === 200 && rej.status === 200
      ? ok('B2 cancel-request → reject')
      : fail('B2 cancel-request → reject', `req=${req.status} rej=${rej.status}`);

    const created2 = await json('POST', '/api/orders', {
      token: customer,
      body: {
        storeId: 'DOM001',
        orderType: 'TAKEAWAY',
        orderSource: 'MASOVA',
        customerName: 'Anna Approve',
        customerId: customerSub,
        items: [{ menuItemId: 'm1', name: 'Margherita', quantity: 1, price: 9.0 }],
      },
    });
    const oid2 = created2.data?.id;
    await json('POST', `/api/orders/${oid2}/cancel-request`, {
      token: customer,
      body: { reason: 'e2e approve path' },
    });
    const appr = await json('POST', `/api/orders/${oid2}/cancel-request/approve`, {
      token: manager,
    });
    const fin = await json('GET', `/api/orders/${oid2}`, { token: manager });
    appr.status === 200 && fin.data?.status === 'CANCELLED'
      ? ok('B2 cancel-request → approve → CANCELLED')
      : fail('B2 cancel-request → approve', `appr=${appr.status} st=${fin.data?.status}`);
  }

  // —— WS sockjs info (commerce) ——
  {
    const host = GW.replace(/:\d+$/, ':8084').replace('8080', '8084');
    // if GW is http://192.168.50.88:8080 → commerce 8084
    const commerceBase = GW.includes(':8080')
      ? GW.replace(':8080', ':8084')
      : 'http://192.168.50.88:8084';
    try {
      const res = await fetch(`${commerceBase}/ws/orders/info`);
      const data = await res.json();
      res.ok && data.websocket
        ? ok('KDS SockJS /ws/orders/info', commerceBase)
        : fail('KDS SockJS /ws/orders/info', String(res.status));
    } catch (e) {
      fail('KDS SockJS /ws/orders/info', e.message);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) {
    process.exit(1);
  }
  console.log('Phase B residual E2E: ALL GREEN\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
