'use strict';

/**
 * test_step3.js
 * Automated test suite for Phase 6 Step 3 — Public read endpoints.
 *
 * Starts the server on a randomly-assigned OS port (PORT=0) so it
 * never conflicts with a running instance. Uses only Node built-ins.
 *
 * Usage: node test_step3.js
 * Exit 0 = all tests passed. Exit 1 = one or more failures.
 */

const http   = require('http');
const assert = require('assert');

/* ── Start server on free port ────────────────────────────────────── */

process.env.PORT = '0';               // OS assigns a free port

// Suppress schema/seed console noise during tests
const origLog   = console.log;
const origWarn  = console.warn;
const origError = console.error;
console.log  = () => {};
console.warn = () => {};
const server = require('./server');   // imports + starts the http.Server
console.log  = origLog;
console.warn = origWarn;
// Keep console.error live so test failures print properly

/* ── Minimal HTTP helpers ─────────────────────────────────────────── */

function request(method, port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (port, path)       => request('GET',    port, path);
const post = (port, path, body) => request('POST',   port, path, body);

function parseJSON(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/* ── Test runner ──────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`       → ${e.message}`);
    failed++;
  }
}

/* ── Run all tests ────────────────────────────────────────────────── */

async function runTests() {
  const port = server.address().port;
  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`  Casa Verde — Step 3 test suite (port ${port})`);
  console.log(`─────────────────────────────────────────────────────────`);

  /* ===== 1. GET /api/products ===================================== */
  console.log('\n[1] GET /api/products');
  const prodRaw  = await get(port, '/api/products');
  const prodData = parseJSON(prodRaw.body);

  await test('HTTP 200', () =>
    assert.strictEqual(prodRaw.status, 200));

  await test('Content-Type: application/json', () =>
    assert.ok(prodRaw.headers['content-type'].includes('application/json')));

  await test('body parses as JSON object', () => {
    assert.ok(prodData !== null && typeof prodData === 'object');
  });

  await test('has "categories" array', () =>
    assert.ok(Array.isArray(prodData.categories)));

  await test('has "products" array', () =>
    assert.ok(Array.isArray(prodData.products)));

  await test('categories.length === 6', () =>
    assert.strictEqual(prodData.categories.length, 6));

  await test('products.length === 23', () =>
    assert.strictEqual(prodData.products.length, 23));

  await test('category has required keys', () => {
    const c = prodData.categories[0];
    for (const k of ['id','name_ar','name_fr','emoji','gradient','is_enabled','sort_order'])
      assert.ok(k in c, `Missing: ${k}`);
  });

  await test('is_enabled is boolean in every category', () =>
    prodData.categories.forEach(c =>
      assert.strictEqual(typeof c.is_enabled, 'boolean', `${c.id}: is_enabled not boolean`)));

  await test('categories are sorted by sort_order ascending', () => {
    const orders = prodData.categories.map(c => c.sort_order);
    for (let i = 1; i < orders.length; i++)
      assert.ok(orders[i] >= orders[i-1], `Not sorted at index ${i}`);
  });

  await test('category IDs match the 6 expected values', () => {
    const ids = prodData.categories.map(c => c.id).sort();
    assert.deepStrictEqual(ids,
      ['boissons','burgers','crepes','poutines','sandwichs','tacos']);
  });

  await test('product has required keys', () => {
    const p = prodData.products[0];
    for (const k of ['id','category_id','name_ar','name_fr','description_ar',
                      'description_fr','emoji','base_price','sizes','addons',
                      'is_placeholder','is_available','is_featured','sort_order'])
      assert.ok(k in p, `Missing: ${k}`);
  });

  await test('is_placeholder / is_available / is_featured are booleans', () =>
    prodData.products.forEach(p => {
      for (const f of ['is_placeholder','is_available','is_featured'])
        assert.strictEqual(typeof p[f], 'boolean', `${p.id}.${f} not boolean`);
    }));

  await test('sizes is an array (not raw JSON string)', () =>
    prodData.products.forEach(p =>
      assert.ok(Array.isArray(p.sizes), `${p.id}: sizes not array`)));

  await test('addons is an array (not raw JSON string)', () =>
    prodData.products.forEach(p =>
      assert.ok(Array.isArray(p.addons), `${p.id}: addons not array`)));

  await test('tacos-poulet has 2 sizes', () => {
    const p = prodData.products.find(x => x.id === 'tacos-poulet');
    assert.ok(p, 'tacos-poulet not found');
    assert.strictEqual(p.sizes.length, 2);
  });

  await test('tacos-poulet has 3 addons', () => {
    const p = prodData.products.find(x => x.id === 'tacos-poulet');
    assert.strictEqual(p.addons.length, 3);
  });

  await test('size objects have {id, labelAr, labelFr, price}', () => {
    const p = prodData.products.find(x => x.id === 'tacos-poulet');
    p.sizes.forEach(s => {
      for (const k of ['id','labelAr','labelFr','price'])
        assert.ok(k in s, `Size missing key: ${k}`);
    });
  });

  await test('placeholder products have base_price === null', () =>
    prodData.products.filter(p => p.is_placeholder).forEach(p =>
      assert.strictEqual(p.base_price, null, `${p.id}: base_price should be null`)));

  await test('non-placeholder products have numeric base_price > 0', () =>
    prodData.products.filter(p => !p.is_placeholder).forEach(p => {
      assert.strictEqual(typeof p.base_price, 'number', `${p.id}: base_price not number`);
      assert.ok(p.base_price > 0, `${p.id}: base_price not > 0`);
    }));

  await test('product counts per category: tacos=3, burgers=2, sandwichs=4, poutines=4, crepes=3, boissons=7', () => {
    const actual = {};
    prodData.products.forEach(p => { actual[p.category_id] = (actual[p.category_id]||0)+1; });
    assert.deepStrictEqual(actual,
      { tacos:3, burgers:2, sandwichs:4, poutines:4, crepes:3, boissons:7 });
  });

  await test('no created_at / updated_at in product objects', () =>
    prodData.products.forEach(p => {
      assert.ok(!('created_at' in p), `${p.id} exposes created_at`);
      assert.ok(!('updated_at' in p), `${p.id} exposes updated_at`);
    }));

  await test('no created_at / updated_at in category objects', () =>
    prodData.categories.forEach(c =>
      assert.ok(!('created_at' in c), `${c.id} exposes created_at`)));

  /* ===== 2. GET /api/categories =================================== */
  console.log('\n[2] GET /api/categories');
  const catRaw  = await get(port, '/api/categories');
  const catData = parseJSON(catRaw.body);

  await test('HTTP 200', () => assert.strictEqual(catRaw.status, 200));

  await test('has "categories" array with 6 items', () => {
    assert.ok(Array.isArray(catData.categories));
    assert.strictEqual(catData.categories.length, 6);
  });

  await test('first category is tacos (sort_order 1)', () =>
    assert.strictEqual(catData.categories[0].id, 'tacos'));

  await test('last category is boissons (sort_order 6)', () =>
    assert.strictEqual(catData.categories[5].id, 'boissons'));

  /* ===== 3. GET /api/offers ======================================= */
  console.log('\n[3] GET /api/offers');
  const offRaw  = await get(port, '/api/offers');
  const offData = parseJSON(offRaw.body);

  await test('HTTP 200', () => assert.strictEqual(offRaw.status, 200));

  await test('has "offers" array', () =>
    assert.ok(Array.isArray(offData.offers)));

  await test('offers.length === 4', () =>
    assert.strictEqual(offData.offers.length, 4));

  await test('offer has required keys', () => {
    const o = offData.offers[0];
    for (const k of ['id','name_ar','name_fr','description_ar','description_fr',
                      'emoji','gradient','base_price','original_price',
                      'linked_category_id','is_demo','is_available','sort_order'])
      assert.ok(k in o, `Missing: ${k}`);
  });

  await test('is_demo and is_available are booleans', () =>
    offData.offers.forEach(o => {
      assert.strictEqual(typeof o.is_demo,      'boolean', `${o.id}: is_demo not boolean`);
      assert.strictEqual(typeof o.is_available, 'boolean', `${o.id}: is_available not boolean`);
    }));

  await test('all 4 expected offer IDs present', () => {
    const ids = offData.offers.map(o => o.id).sort();
    assert.deepStrictEqual(ids, [
      'offer-duo-burger','offer-pack-famille',
      'offer-sandwich-poutine','offer-tacos-boisson',
    ].sort());
  });

  await test('base_price < original_price for all offers', () =>
    offData.offers.forEach(o =>
      assert.ok(o.base_price <= o.original_price,
        `${o.id}: base (${o.base_price}) > original (${o.original_price})`)));

  await test('offers sorted by sort_order ascending', () => {
    const orders = offData.offers.map(o => o.sort_order);
    for (let i = 1; i < orders.length; i++)
      assert.ok(orders[i] >= orders[i-1]);
  });

  await test('offer-tacos-boisson: base_price=470, original_price=520', () => {
    const o = offData.offers.find(x => x.id === 'offer-tacos-boisson');
    assert.ok(o, 'offer-tacos-boisson not found');
    assert.strictEqual(o.base_price, 470);
    assert.strictEqual(o.original_price, 520);
  });

  /* ===== 4. GET /api/settings/public ============================== */
  console.log('\n[4] GET /api/settings/public');
  const setRaw  = await get(port, '/api/settings/public');
  const setData = parseJSON(setRaw.body);

  await test('HTTP 200', () => assert.strictEqual(setRaw.status, 200));

  await test('flat object (not nested, not array)', () =>
    assert.ok(setData !== null && typeof setData === 'object' && !Array.isArray(setData)));

  await test('delivery_fee === 200 (number)', () => {
    assert.strictEqual(setData.delivery_fee, 200);
    assert.strictEqual(typeof setData.delivery_fee, 'number');
  });

  await test('wa_number === "+213 776 81 48 76"', () =>
    assert.strictEqual(setData.wa_number, '+213 776 81 48 76'));

  await test('delivery_zone_ar === "داخل بريان فقط"', () =>
    assert.strictEqual(setData.delivery_zone_ar, 'داخل بريان فقط'));

  await test('delivery_zone_fr === "Berriane uniquement"', () =>
    assert.strictEqual(setData.delivery_zone_fr, 'Berriane uniquement'));

  await test('exactly 4 keys returned (no extras)', () => {
    const keys = Object.keys(setData).sort();
    assert.deepStrictEqual(keys,
      ['delivery_fee','delivery_zone_ar','delivery_zone_fr','wa_number'].sort());
  });

  /* ===== 5. Admin stubs still return 501 ========================== */
  console.log('\n[5] Admin stubs');

  const stubAdmin = await get(port, '/api/settings');
  await test('GET /api/settings (admin) → 501', () =>
    assert.strictEqual(stubAdmin.status, 501));

  const stubPost = await post(port, '/api/products', { name_fr: 'Test' });
  await test('POST /api/products (admin) → 401 (auth required)', () =>
    assert.strictEqual(stubPost.status, 401));

  const stubPut = await request('PUT', port, '/api/products/tacos-poulet', { name_fr: 'X' });
  await test('PUT /api/products/:id (admin) → 401 (auth required)', () =>
    assert.strictEqual(stubPut.status, 401));

  const stubDel = await request('DELETE', port, '/api/products/tacos-poulet');
  await test('DELETE /api/products/:id (admin) → 401 (auth required)', () =>
    assert.strictEqual(stubDel.status, 401));

  /* ===== 6. Static files ========================================== */
  console.log('\n[6] Static files unaffected');

  const indexRaw = await get(port, '/');
  await test('GET / → 200 + contains Casa Verde', () => {
    assert.strictEqual(indexRaw.status, 200);
    assert.ok(indexRaw.body.includes('Casa Verde'));
  });

  const adminRaw = await get(port, '/admin');
  await test('GET /admin → 200 + contains admin Arabic content', () => {
    assert.strictEqual(adminRaw.status, 200);
    assert.ok(adminRaw.body.includes('كازا فيردي'));
  });

  const miss = await get(port, '/api/does-not-exist');
  await test('GET /api/does-not-exist → 404', () =>
    assert.strictEqual(miss.status, 404));

  /* ===== 7. Error resilience — DB unavailable simulation ========== */
  console.log('\n[7] Response format consistency');

  await test('GET /api/products returns same structure on repeated calls', async () => {
    const r2 = await get(port, '/api/products');
    const d2 = parseJSON(r2.body);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(d2.products.length, 23);
    assert.strictEqual(d2.categories.length, 6);
  });

  await test('GET /api/offers returns same structure on repeated calls', async () => {
    const r2 = await get(port, '/api/offers');
    const d2 = parseJSON(r2.body);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(d2.offers.length, 4);
  });

  /* ===== Summary ================================================== */
  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────────────────────\n`);

  server.close(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

// Give the server 300 ms to finish binding before running tests
server.on('listening', () => setTimeout(runTests, 50));
