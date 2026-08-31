'use strict';

/**
 * test_step7.js — Phase 6 Step 7: Admin CRUD API
 *
 * Tests every endpoint, every validation rule, every auth guard.
 * Uses an in-process server on port 0 and a test JWT secret.
 * The DB is shared with the live seed data; all mutations are
 * cleaned up (rollback via delete/restore) so regressions stay green.
 */

const http   = require('http');
const assert = require('assert');

/* ── Boot ─────────────────────────────────────────────────────────── */

process.env.PORT             = '0';
process.env.JWT_SECRET       = 'test-secret-step7';
process.env.DISABLE_RATE_LIMIT = '1';

const origLog  = console.log;
const origWarn = console.warn;
const origErr  = console.error;
console.log  = () => {};
console.warn = () => {};
console.error = () => {};
const server = require('./server');
console.log  = origLog;
console.warn = origWarn;
console.error = origErr;

/* ── JWT helper ───────────────────────────────────────────────────── */

const jwt = require('jsonwebtoken');
const VALID_TOKEN = jwt.sign(
  { id: 1, username: 'admin' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
const INVALID_TOKEN = 'this.is.not.valid';

/* ── HTTP helpers ─────────────────────────────────────────────────── */

function request(method, port, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(extraHeaders || {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const authH   = { Authorization: `Bearer ${VALID_TOKEN}` };
const badAuthH = { Authorization: `Bearer ${INVALID_TOKEN}` };

const get    = (port, path)       => request('GET',    port, path);
const authGet= (port, path)       => request('GET',    port, path, undefined, authH);
const post   = (port, path, body) => request('POST',   port, path, body, authH);
const put    = (port, path, body) => request('PUT',    port, path, body, authH);
const del    = (port, path)       => request('DELETE', port, path, undefined, authH);
const patch  = (port, path, body) => request('PATCH',  port, path, body, authH);
const noAuth = (method, port, path, body) => request(method, port, path, body);

/* ── Runner ───────────────────────────────────────────────────────── */

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}\n       → ${e.message}`);
    failed++;
  }
}

/* ── Main ─────────────────────────────────────────────────────────── */

async function run() {
  const port = server.address().port;
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  Casa Verde — Step 7 CRUD test suite  (port ${port})`);
  console.log(`${'─'.repeat(58)}`);

  /* ═══════ 1. AUTH GUARDS ══════════════════════════════════════ */
  console.log('\n[1] Auth guards — all write endpoints return 401 without token');

  const guards = [
    ['POST',   '/api/products'],
    ['PUT',    '/api/products/tacos-poulet'],
    ['DELETE', '/api/products/tacos-poulet'],
    ['PATCH',  '/api/products/tacos-poulet/toggle-available'],
    ['PATCH',  '/api/products/tacos-poulet/toggle-featured'],
    ['POST',   '/api/categories'],
    ['PUT',    '/api/categories/tacos'],
    ['DELETE', '/api/categories/tacos'],
    ['PATCH',  '/api/categories/tacos/toggle-enabled'],
    ['PATCH',  '/api/categories/tacos/reorder'],
    ['POST',   '/api/offers'],
    ['PUT',    '/api/offers/offer-tacos-boisson'],
    ['DELETE', '/api/offers/offer-tacos-boisson'],
    ['PATCH',  '/api/offers/offer-tacos-boisson/toggle-available'],
  ];

  for (const [method, path] of guards) {
    const r = await noAuth(method, port, path, {});
    await test(`${method} ${path} → 401 without token`, () =>
      assert.strictEqual(r.status, 401, `got ${r.status}`));
  }

  for (const [method, path] of guards.slice(0, 3)) {
    const r = await request(method, port, path, {}, badAuthH);
    await test(`${method} ${path} → 401 with invalid token`, () =>
      assert.strictEqual(r.status, 401));
  }

  /* ═══════ 2. PUBLIC GETs ══════════════════════════════════════ */
  console.log('\n[2] Public GET endpoints (no auth required)');

  const prodR = await get(port, '/api/products');
  await test('GET /api/products → 200', () => assert.strictEqual(prodR.status, 200));
  await test('returns 23 products',     () => assert.strictEqual(prodR.data.products.length, 23));
  await test('returns 6 categories',    () => assert.strictEqual(prodR.data.categories.length, 6));

  const catR = await get(port, '/api/categories');
  await test('GET /api/categories → 200', () => assert.strictEqual(catR.status, 200));
  await test('returns 6 categories',      () => assert.strictEqual(catR.data.categories.length, 6));

  const offR = await get(port, '/api/offers');
  await test('GET /api/offers → 200', () => assert.strictEqual(offR.status, 200));
  await test('returns 4 offers',      () => assert.strictEqual(offR.data.offers.length, 4));

  /* ═══════ 3. PRODUCTS CRUD ════════════════════════════════════ */
  console.log('\n[3] Products — Create (POST /api/products)');

  const newProd = {
    id: 'test-burger-special',
    category_id: 'burgers',
    name_ar: 'برغر خاص',
    name_fr: 'Burger Spécial',
    description_ar: 'وصف تجريبي',
    description_fr: 'Description test',
    emoji: '🍔',
    base_price: 300,
    sizes: [],
    addons: [],
    is_available: true,
    is_featured: false,
    is_placeholder: false,
  };

  const createR = await post(port, '/api/products', newProd);
  await test('POST → 201', () => assert.strictEqual(createR.status, 201));
  await test('returns product object', () => assert.ok(createR.data.product));
  await test('id correct',     () => assert.strictEqual(createR.data.product.id, 'test-burger-special'));
  await test('category_id',    () => assert.strictEqual(createR.data.product.category_id, 'burgers'));
  await test('name_ar',        () => assert.strictEqual(createR.data.product.name_ar, 'برغر خاص'));
  await test('base_price',     () => assert.strictEqual(createR.data.product.base_price, 300));
  await test('is_available is boolean', () => assert.strictEqual(typeof createR.data.product.is_available, 'boolean'));
  await test('sizes is array',  () => assert.ok(Array.isArray(createR.data.product.sizes)));
  await test('addons is array', () => assert.ok(Array.isArray(createR.data.product.addons)));

  // Auto sort_order
  await test('sort_order assigned (> 0)', () => assert.ok(createR.data.product.sort_order > 0));

  // Public list now has 24 products
  const afterCreate = await get(port, '/api/products');
  await test('public GET now returns 24 products after create', () =>
    assert.strictEqual(afterCreate.data.products.length, 24));

  console.log('\n[3b] Products — Create validation failures');

  const badId = await post(port, '/api/products', { ...newProd, id: 'Bad ID!' });
  await test('400 on bad id slug', () => assert.strictEqual(badId.status, 400));

  const dupId = await post(port, '/api/products', newProd);
  await test('409 on duplicate id', () => assert.strictEqual(dupId.status, 409));

  const missingName = await post(port, '/api/products', { id: 'test-x', category_id: 'burgers' });
  await test('400 on missing name_ar', () => assert.strictEqual(missingName.status, 400));

  const badCat = await post(port, '/api/products', { ...newProd, id: 'test-y', category_id: 'nonexistent' });
  await test('400 on invalid category_id', () => assert.strictEqual(badCat.status, 400));

  const negPrice = await post(port, '/api/products', { ...newProd, id: 'test-z', base_price: -50 });
  await test('400 on negative base_price', () => assert.strictEqual(negPrice.status, 400));

  const badSizes = await post(port, '/api/products', { ...newProd, id: 'test-sz', sizes: 'not-an-array' });
  await test('400 when sizes is not an array', () => assert.strictEqual(badSizes.status, 400));

  const badAddons = await post(port, '/api/products', { ...newProd, id: 'test-ad', addons: 'bad' });
  await test('400 when addons is not an array', () => assert.strictEqual(badAddons.status, 400));

  const nullPrice = await post(port, '/api/products', { ...newProd, id: 'test-null', base_price: null, is_placeholder: true });
  await test('201 with null base_price when is_placeholder=true', () => assert.strictEqual(nullPrice.status, 201));
  await test('base_price is null on placeholder', () => assert.strictEqual(nullPrice.data.product.base_price, null));

  // Cleanup placeholder
  await del(port, '/api/products/test-null');

  console.log('\n[3c] Products — Update (PUT /api/products/:id)');

  const updateR = await put(port, '/api/products/test-burger-special', {
    name_fr: 'Burger Spécial Modifié',
    base_price: 350,
    is_featured: true,
  });
  await test('PUT → 200', () => assert.strictEqual(updateR.status, 200));
  await test('name_fr updated',   () => assert.strictEqual(updateR.data.product.name_fr, 'Burger Spécial Modifié'));
  await test('base_price updated',() => assert.strictEqual(updateR.data.product.base_price, 350));
  await test('is_featured updated',() => assert.strictEqual(updateR.data.product.is_featured, true));
  await test('name_ar unchanged', () => assert.strictEqual(updateR.data.product.name_ar, 'برغر خاص'));

  const put404 = await put(port, '/api/products/does-not-exist', { name_fr: 'X' });
  await test('PUT → 404 for unknown id', () => assert.strictEqual(put404.status, 404));

  const putBadCat = await put(port, '/api/products/test-burger-special', { category_id: 'ghost' });
  await test('PUT → 400 for invalid category_id', () => assert.strictEqual(putBadCat.status, 400));

  console.log('\n[3d] Products — Toggle endpoints');

  // Read current state before toggling
  const beforeTog = await get(port, '/api/products');
  const prodBefore = beforeTog.data.products.find(p => p.id === 'test-burger-special');

  const togAvail = await patch(port, '/api/products/test-burger-special/toggle-available', {});
  await test('toggle-available flips is_available', () => {
    assert.strictEqual(togAvail.status, 200);
    assert.strictEqual(togAvail.data.product.is_available, !prodBefore.is_available);
  });

  const togFeat = await patch(port, '/api/products/test-burger-special/toggle-featured', {});
  await test('toggle-featured flips is_featured', () => {
    assert.strictEqual(togFeat.status, 200);
    assert.strictEqual(togFeat.data.product.is_featured, !prodBefore.is_featured);
  });

  console.log('\n[3e] Products — Delete (DELETE /api/products/:id)');

  const sizes = [{ id: 'S', labelAr: 'صغير', labelFr: 'Petit', price: 200 }];
  const withSizes = await post(port, '/api/products', {
    ...newProd, id: 'test-with-sizes', sizes, addons: [{ id: 'x', labelAr: 'إضافة', labelFr: 'Extra', price: 50 }],
  });
  await test('create product with sizes+addons → 201', () => assert.strictEqual(withSizes.status, 201));
  await test('sizes round-trip correctly', () => assert.strictEqual(withSizes.data.product.sizes.length, 1));
  await test('addons round-trip correctly', () => assert.strictEqual(withSizes.data.product.addons.length, 1));
  await del(port, '/api/products/test-with-sizes');

  const delR = await del(port, '/api/products/test-burger-special');
  await test('DELETE → 200', () => assert.strictEqual(delR.status, 200));
  await test('returns deleted:true', () => assert.strictEqual(delR.data.deleted, true));
  await test('returns deleted id',   () => assert.strictEqual(delR.data.id, 'test-burger-special'));

  const del404 = await del(port, '/api/products/does-not-exist');
  await test('DELETE → 404 for unknown id', () => assert.strictEqual(del404.status, 404));

  // Back to 23
  const afterDel = await get(port, '/api/products');
  await test('public GET returns 23 products after delete', () =>
    assert.strictEqual(afterDel.data.products.length, 23));

  /* ═══════ 4. CATEGORIES CRUD ══════════════════════════════════ */
  console.log('\n[4] Categories — Create (POST /api/categories)');

  const newCat = {
    id: 'test-desserts',
    name_ar: 'حلويات',
    name_fr: 'Desserts',
    emoji: '🍰',
    gradient: 'linear-gradient(135deg,#333,#666)',
    is_enabled: true,
  };

  const catCreate = await post(port, '/api/categories', newCat);
  await test('POST → 201', () => assert.strictEqual(catCreate.status, 201));
  await test('id correct',    () => assert.strictEqual(catCreate.data.category.id, 'test-desserts'));
  await test('name_ar',       () => assert.strictEqual(catCreate.data.category.name_ar, 'حلويات'));
  await test('is_enabled bool', () => assert.strictEqual(typeof catCreate.data.category.is_enabled, 'boolean'));
  await test('sort_order > 0',  () => assert.ok(catCreate.data.category.sort_order > 0));

  const afterCatCreate = await get(port, '/api/categories');
  await test('GET /api/categories now returns 7', () =>
    assert.strictEqual(afterCatCreate.data.categories.length, 7));

  console.log('\n[4b] Categories — Create validation');

  const catDup = await post(port, '/api/categories', newCat);
  await test('409 on duplicate category id', () => assert.strictEqual(catDup.status, 409));

  const catBadId = await post(port, '/api/categories', { ...newCat, id: 'Bad Cat!' });
  await test('400 on invalid id slug', () => assert.strictEqual(catBadId.status, 400));

  const catNoName = await post(port, '/api/categories', { id: 'test-x2' });
  await test('400 on missing name_ar', () => assert.strictEqual(catNoName.status, 400));

  console.log('\n[4c] Categories — Update (PUT /api/categories/:id)');

  const catUpdate = await put(port, '/api/categories/test-desserts', {
    name_fr: 'Pâtisseries',
    is_enabled: false,
  });
  await test('PUT → 200', () => assert.strictEqual(catUpdate.status, 200));
  await test('name_fr updated',    () => assert.strictEqual(catUpdate.data.category.name_fr, 'Pâtisseries'));
  await test('is_enabled updated', () => assert.strictEqual(catUpdate.data.category.is_enabled, false));
  await test('name_ar unchanged',  () => assert.strictEqual(catUpdate.data.category.name_ar, 'حلويات'));

  const catPut404 = await put(port, '/api/categories/does-not-exist', { name_fr: 'X', name_ar: 'X' });
  await test('PUT → 404 for unknown id', () => assert.strictEqual(catPut404.status, 404));

  console.log('\n[4d] Categories — toggle-enabled and reorder');

  const catBeforeTog = await get(port, '/api/categories');
  const catBefore = catBeforeTog.data.categories.find(c => c.id === 'test-desserts');

  const togEnabled = await patch(port, '/api/categories/test-desserts/toggle-enabled', {});
  await test('toggle-enabled flips is_enabled', () => {
    assert.strictEqual(togEnabled.status, 200);
    assert.strictEqual(togEnabled.data.category.is_enabled, !catBefore.is_enabled);
  });

  // Reorder — move tacos down one position
  const tacosOrder = catR.data.categories.find(c => c.id === 'tacos').sort_order; // 1
  const reorderR = await patch(port, '/api/categories/tacos/reorder', { direction: 'down' });
  await test('reorder → 200', () => assert.strictEqual(reorderR.status, 200));
  await test('returns moved category', () => assert.ok(reorderR.data.moved));
  await test('returns displaced category', () => assert.ok(reorderR.data.displaced));
  await test('moved.sort_order changed', () =>
    assert.notStrictEqual(reorderR.data.moved.sort_order, tacosOrder));

  // Restore tacos to original position
  await patch(port, '/api/categories/tacos/reorder', { direction: 'up' });

  const reorderBad = await patch(port, '/api/categories/tacos/reorder', { direction: 'sideways' });
  await test('400 on invalid direction', () => assert.strictEqual(reorderBad.status, 400));

  console.log('\n[4e] Categories — Delete protection and cleanup');

  // Cannot delete a category that has products
  const delWithProds = await del(port, '/api/categories/tacos');
  await test('409 when deleting category with products', () => assert.strictEqual(delWithProds.status, 409));
  await test('error mentions product count', () =>
    assert.ok(delWithProds.data.error.includes('product'), delWithProds.data.error));

  // Can delete the test category (no products)
  const catDel = await del(port, '/api/categories/test-desserts');
  await test('DELETE → 200 for empty category', () => assert.strictEqual(catDel.status, 200));
  await test('deleted:true', () => assert.strictEqual(catDel.data.deleted, true));

  const catDel404 = await del(port, '/api/categories/does-not-exist');
  await test('DELETE → 404 for unknown id', () => assert.strictEqual(catDel404.status, 404));

  const afterCatDel = await get(port, '/api/categories');
  await test('GET returns 6 categories after delete', () =>
    assert.strictEqual(afterCatDel.data.categories.length, 6));

  /* ═══════ 5. OFFERS CRUD ══════════════════════════════════════ */
  console.log('\n[5] Offers — Create (POST /api/offers)');

  const newOffer = {
    id: 'test-offer-special',
    name_ar: 'عرض خاص',
    name_fr: 'Offre Spéciale',
    description_ar: 'وصف العرض',
    description_fr: 'Description offre',
    emoji: '🎁',
    gradient: 'linear-gradient(135deg,#1a3a2e,#2d6048)',
    base_price: 500,
    original_price: 700,
    linked_category_id: 'burgers',
    is_demo: true,
    is_available: true,
  };

  const offCreate = await post(port, '/api/offers', newOffer);
  await test('POST → 201', () => assert.strictEqual(offCreate.status, 201));
  await test('id correct',            () => assert.strictEqual(offCreate.data.offer.id, 'test-offer-special'));
  await test('base_price',            () => assert.strictEqual(offCreate.data.offer.base_price, 500));
  await test('original_price',        () => assert.strictEqual(offCreate.data.offer.original_price, 700));
  await test('linked_category_id',    () => assert.strictEqual(offCreate.data.offer.linked_category_id, 'burgers'));
  await test('is_demo is boolean',    () => assert.strictEqual(typeof offCreate.data.offer.is_demo, 'boolean'));
  await test('is_available is boolean',() => assert.strictEqual(typeof offCreate.data.offer.is_available, 'boolean'));

  const afterOffCreate = await get(port, '/api/offers');
  await test('GET returns 5 offers after create', () =>
    assert.strictEqual(afterOffCreate.data.offers.length, 5));

  console.log('\n[5b] Offers — Create validation');

  const offDup = await post(port, '/api/offers', newOffer);
  await test('409 on duplicate id', () => assert.strictEqual(offDup.status, 409));

  const offBadId = await post(port, '/api/offers', { ...newOffer, id: 'Bad Offer!' });
  await test('400 on invalid id slug', () => assert.strictEqual(offBadId.status, 400));

  const offNoName = await post(port, '/api/offers', { id: 'test-off-x', base_price: 100, original_price: 200 });
  await test('400 on missing name_ar', () => assert.strictEqual(offNoName.status, 400));

  // Price constraint: base_price > original_price must be rejected
  const offBadPrice = await post(port, '/api/offers', {
    ...newOffer, id: 'test-off-bad', base_price: 800, original_price: 500,
  });
  await test('400 when base_price > original_price', () => assert.strictEqual(offBadPrice.status, 400));
  await test('error or details mention original_price constraint', () => {
    const msg = JSON.stringify(offBadPrice.data);
    assert.ok(msg.toLowerCase().includes('original_price'), `Response: ${msg}`);
  });

  // Equal prices are valid (no discount but not a violation)
  const offEqualPrice = await post(port, '/api/offers', {
    ...newOffer, id: 'test-off-equal', base_price: 500, original_price: 500,
  });
  await test('201 when base_price === original_price (valid)', () =>
    assert.strictEqual(offEqualPrice.status, 201));
  await del(port, '/api/offers/test-off-equal');

  const offBadCat = await post(port, '/api/offers', {
    ...newOffer, id: 'test-off-cat', linked_category_id: 'ghost',
  });
  await test('400 on invalid linked_category_id', () => assert.strictEqual(offBadCat.status, 400));

  console.log('\n[5c] Offers — Update (PUT /api/offers/:id)');

  const offUpdate = await put(port, '/api/offers/test-offer-special', {
    base_price: 450,
    original_price: 700,
    name_fr: 'Offre Modifiée',
    is_available: false,
  });
  await test('PUT → 200', () => assert.strictEqual(offUpdate.status, 200));
  await test('base_price updated',  () => assert.strictEqual(offUpdate.data.offer.base_price, 450));
  await test('name_fr updated',     () => assert.strictEqual(offUpdate.data.offer.name_fr, 'Offre Modifiée'));
  await test('is_available updated',() => assert.strictEqual(offUpdate.data.offer.is_available, false));
  await test('name_ar unchanged',   () => assert.strictEqual(offUpdate.data.offer.name_ar, 'عرض خاص'));

  // Price constraint on update
  const offUpdateBadPrice = await put(port, '/api/offers/test-offer-special', {
    base_price: 999, original_price: 100,
  });
  await test('PUT 400 when update makes base_price > original_price', () =>
    assert.strictEqual(offUpdateBadPrice.status, 400));

  const offPut404 = await put(port, '/api/offers/does-not-exist', { name_fr: 'X', name_ar: 'X' });
  await test('PUT → 404 for unknown id', () => assert.strictEqual(offPut404.status, 404));

  console.log('\n[5d] Offers — toggle-available');

  const offBeforeTog = await get(port, '/api/offers');
  const offBefore = offBeforeTog.data.offers.find(o => o.id === 'test-offer-special');

  const offTog = await patch(port, '/api/offers/test-offer-special/toggle-available', {});
  await test('toggle-available flips is_available', () => {
    assert.strictEqual(offTog.status, 200);
    assert.strictEqual(offTog.data.offer.is_available, !offBefore.is_available);
  });

  console.log('\n[5e] Offers — Delete');

  const offDel = await del(port, '/api/offers/test-offer-special');
  await test('DELETE → 200', () => assert.strictEqual(offDel.status, 200));
  await test('deleted:true', () => assert.strictEqual(offDel.data.deleted, true));

  const offDel404 = await del(port, '/api/offers/does-not-exist');
  await test('DELETE → 404 for unknown id', () => assert.strictEqual(offDel404.status, 404));

  const afterOffDel = await get(port, '/api/offers');
  await test('GET returns 4 offers after delete', () =>
    assert.strictEqual(afterOffDel.data.offers.length, 4));

  /* ═══════ 6. BOOLEAN COERCION ═════════════════════════════════ */
  console.log('\n[6] Boolean coercion (integers stored as 0/1, returned as bool)');

  const boolProd = await post(port, '/api/products', {
    ...newProd, id: 'test-bool-prod',
    is_available: false, is_featured: true, is_placeholder: false,
  });
  await test('is_available false → stored and returned as false', () =>
    assert.strictEqual(boolProd.data.product.is_available, false));
  await test('is_featured true → stored and returned as true', () =>
    assert.strictEqual(boolProd.data.product.is_featured, true));
  await test('is_placeholder false → returned as false', () =>
    assert.strictEqual(boolProd.data.product.is_placeholder, false));
  await del(port, '/api/products/test-bool-prod');

  /* ═══════ 7. SORT_ORDER AUTO-ASSIGN ═══════════════════════════ */
  console.log('\n[7] Auto sort_order assignment');

  const maxOrderR = await get(port, '/api/products');
  const burgersProds = maxOrderR.data.products.filter(p => p.category_id === 'burgers');
  const maxBurgerOrder = Math.max(...burgersProds.map(p => p.sort_order));

  const autoSort = await post(port, '/api/products', {
    ...newProd, id: 'test-auto-sort',
    // No sort_order supplied
  });
  await test('201 without sort_order supplied', () => assert.strictEqual(autoSort.status, 201));
  await test('sort_order = maxBurgerOrder + 1', () =>
    assert.strictEqual(autoSort.data.product.sort_order, maxBurgerOrder + 1));
  await del(port, '/api/products/test-auto-sort');

  /* ═══════ 8. SEEDED DATA INTEGRITY ════════════════════════════ */
  console.log('\n[8] Seeded data integrity after all mutations');

  const finalProds = await get(port, '/api/products');
  await test('products restored to 23', () =>
    assert.strictEqual(finalProds.data.products.length, 23));
  await test('categories still 6',      () =>
    assert.strictEqual(finalProds.data.categories.length, 6));

  const finalOffs = await get(port, '/api/offers');
  await test('offers restored to 4', () =>
    assert.strictEqual(finalOffs.data.offers.length, 4));

  const finalCats = await get(port, '/api/categories');
  await test('categories still 6 (standalone)', () =>
    assert.strictEqual(finalCats.data.categories.length, 6));

  // Spot-check a seeded product
  const tacosPoulet = finalProds.data.products.find(p => p.id === 'tacos-poulet');
  await test('tacos-poulet still has 2 sizes', () =>
    assert.strictEqual(tacosPoulet.sizes.length, 2));
  await test('tacos-poulet still has 3 addons', () =>
    assert.strictEqual(tacosPoulet.addons.length, 3));

  /* ═══════ Summary ═════════════════════════════════════════════ */
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(58)}\n`);

  server.close(() => process.exit(failed > 0 ? 1 : 0));
}

server.on('listening', () => setTimeout(run, 50));
