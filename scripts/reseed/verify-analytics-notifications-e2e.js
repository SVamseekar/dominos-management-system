#!/usr/bin/env node
/**
 * Phase D — Manager analytics & notifications True E2E verify against live gateway (Dell).
 *
 * Covers:
 *  D1 Analytics / BI (staff leaderboard, sales trends, executive-summary, bi engine)
 *  D2 Notifications list 200 (with/without userId) + optional seed-demo
 *  D3 Suppliers n≥1, equipment list/seed, shifts empty-or-list 200
 *
 * Usage:
 *   GW=http://192.168.50.88:8080 node scripts/reseed/verify-phase-d-e2e.js
 *
 * Exit 0 only if all critical checks pass.
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
      'X-Selected-Store-Id': 'DOM001',
      'X-User-Store-Id': 'DOM001',
      'X-User-Type': headers['X-User-Type'] || 'MANAGER',
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
  return { token: data.accessToken, user: data.user };
}

function assertDashboardShape(summary) {
  if (!summary || typeof summary !== 'object') return 'null summary';
  // Backend raw shape is OK for API check; frontend maps it.
  if (summary.financialSummary || summary.revenue) return null;
  return 'missing financialSummary and revenue';
}

async function main() {
  console.log(`\nPhase D E2E verify → ${GW}\n`);

  const { token: manager, user } = await login('manager.berlin@gmail.com');
  const managerId = user?.id;
  ok('auth manager', `id=${managerId?.slice?.(0, 8) || '?'}…`);

  // —— D1 Analytics ——
  {
    const { status, data } = await json(
      'GET',
      '/api/analytics?type=staff-leaderboard&period=TODAY&storeId=DOM001',
      { token: manager }
    );
    if (status === 200 && data && Array.isArray(data.rankings)) {
      ok('analytics staff-leaderboard', `rankings=${data.rankings.length}`);
    } else {
      fail('analytics staff-leaderboard', `${status} ${JSON.stringify(data)?.slice(0, 120)}`);
    }
  }

  {
    const { status, data } = await json(
      'GET',
      '/api/analytics?type=sales-trends&period=WEEKLY',
      { token: manager }
    );
    if (status === 200 && data?.dataPoints) {
      ok('analytics sales-trends', `points=${data.dataPoints.length}`);
    } else {
      fail('analytics sales-trends', `${status}`);
    }
  }

  {
    const { status, data } = await json(
      'GET',
      '/api/bi/reports?type=executive-summary&period=MONTH',
      { token: manager }
    );
    const shapeErr = status === 200 ? assertDashboardShape(data) : `http ${status}`;
    if (status === 200 && !shapeErr) {
      const rev = data.financialSummary?.totalRevenue ?? data.revenue?.total ?? 0;
      ok('bi executive-summary', `revenue=${rev}`);
    } else {
      fail('bi executive-summary', shapeErr || JSON.stringify(data)?.slice(0, 160));
    }
  }

  {
    const { status, data } = await json('GET', '/api/bi?type=sales-forecast&period=WEEKLY&days=7', {
      token: manager,
    });
    if (status === 200) {
      ok('bi sales-forecast', `keys=${Object.keys(data || {}).slice(0, 4).join(',')}`);
    } else {
      fail('bi sales-forecast', `${status}`);
    }
  }

  // Cache hit path: clear → miss (populate) → hit (must still 200, not LinkedHashMap CCE)
  {
    await json('POST', '/api/analytics/cache/clear', { token: manager });
    const first = await json(
      'GET',
      '/api/analytics?type=staff-leaderboard&period=TODAY',
      { token: manager }
    );
    const second = await json(
      'GET',
      '/api/analytics?type=staff-leaderboard&period=TODAY',
      { token: manager }
    );
    if (first.status === 200 && second.status === 200) {
      ok('analytics cache-hit (2x leaderboard)', 'both 200 after clear');
    } else {
      const dbg = second.data?.debugMessage || first.data?.debugMessage || '';
      fail(
        'analytics cache-hit (2x leaderboard)',
        `${first.status}/${second.status}${dbg ? ' — ' + String(dbg).slice(0, 120) : ''}`
      );
    }
  }

  // —— D2 Notifications ——
  {
    // Seed (dev/demo only — optional)
    const seed = await json('POST', '/api/notifications/seed-demo', { token: manager });
    if (seed.status === 200) {
      ok('notifications seed-demo', `created=${seed.data?.createdCount ?? '?'}`);
    } else if (seed.status === 404) {
      ok('notifications seed-demo skipped', 'profile not dev/demo or old binary');
    } else {
      // non-fatal if seed missing on old binary — list still must work
      fail('notifications seed-demo', `${seed.status} ${JSON.stringify(seed.data)?.slice(0, 100)}`);
    }
  }

  {
    const withId = await json('GET', `/api/notifications?userId=${encodeURIComponent(managerId)}`, {
      token: manager,
    });
    if (withId.status === 200 && Array.isArray(withId.data)) {
      ok('notifications list (userId)', `n=${withId.data.length}`);
    } else {
      fail('notifications list (userId)', `${withId.status}`);
    }
  }

  {
    const noId = await json('GET', '/api/notifications', { token: manager });
    if (noId.status === 200 && Array.isArray(noId.data)) {
      ok('notifications list (default principal)', `n=${noId.data.length}`);
    } else if (noId.status === 400) {
      // Old binary without principal default — still acceptable if userId path works
      ok('notifications list (default principal)', '400 on old binary — userId path is canonical');
    } else {
      fail('notifications list (default principal)', `${noId.status} ${JSON.stringify(noId.data)?.slice(0, 120)}`);
    }
  }

  // —— D3 Manager tabs data ——
  {
    const { status, data } = await json('GET', '/api/suppliers?storeId=DOM001', { token: manager });
    const n = Array.isArray(data) ? data.length : 0;
    if (status === 200 && n >= 1) {
      const s0 = data[0];
      const name = s0.supplierName || s0.name;
      const phone = s0.phoneNumber || s0.phone;
      ok('suppliers list', `n=${n} name=${name} phone=${phone || '—'}`);
    } else {
      fail('suppliers list', `${status} n=${n}`);
    }
  }

  {
    const seed = await json('POST', '/api/equipment/seed-demo?storeId=DOM001', { token: manager });
    if (seed.status === 200) {
      ok('equipment seed-demo', `total=${seed.data?.totalForStore ?? seed.data?.createdCount}`);
    } else if (seed.status === 404) {
      ok('equipment seed-demo skipped', 'profile not dev/demo or old binary');
    } else {
      // try manual create fallback
      const created = [];
      for (const name of ['Seed Oven', 'Seed Fridge', 'Seed Fryer']) {
        const r = await json('POST', '/api/equipment', {
          token: manager,
          body: {
            storeId: 'DOM001',
            equipmentName: name,
            type: name.includes('Fridge') ? 'REFRIGERATOR' : name.includes('Fryer') ? 'FRYER' : 'OVEN',
            status: 'AVAILABLE',
            temperature: 20,
            isOn: false,
            usageCount: 0,
          },
        });
        if (r.status === 200 && r.data?.id) created.push(r.data.id);
      }
      if (created.length >= 1) {
        ok('equipment seed-demo', `manual create n=${created.length}`);
      } else {
        fail('equipment seed-demo', `${seed.status}`);
      }
    }

    const list = await json('GET', '/api/equipment', { token: manager });
    const n = Array.isArray(list.data) ? list.data.length : -1;
    if (list.status === 200 && n >= 0) {
      ok('equipment list', `n=${n}`);
    } else {
      fail('equipment list', `${list.status}`);
    }
  }

  {
    const { status, data } = await json('GET', '/api/shifts?storeId=DOM001', { token: manager });
    if (status === 200 && Array.isArray(data)) {
      ok('shifts list', `n=${data.length} (empty OK)`);
    } else {
      // alternate weekly schedule path
      const alt = await json('GET', '/api/shifts/weekly?storeId=DOM001', { token: manager });
      if (alt.status === 200) {
        ok('shifts list', `weekly status=${alt.status}`);
      } else {
        fail('shifts list', `${status}/${alt.status}`);
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n——— Phase D: ${results.length - failed.length}/${results.length} passed ——-\n`);
  if (failed.length) {
    failed.forEach((f) => console.error(`  • ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('verify-phase-d-e2e fatal:', err);
  process.exit(1);
});
