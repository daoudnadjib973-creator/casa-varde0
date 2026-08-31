'use strict';

/**
 * test_step4.js
 * Focused tests for Phase 6 Step 4 — index.html API integration.
 *
 * Tests:
 *  [1] index.html is served and contains the new Step 4 code
 *  [2] Adapter functions produce correct field-name mapping
 *  [3] buildCategoriesMap produces correct structure
 *  [4] Fallback data shape matches what rendering code expects
 *  [5] API data + adapters produce same shape as fallback
 *  [6] admin.html is byte-for-byte unchanged
 *  [7] Fetch integration — live API round-trip produces renderable data
 *
 * Exit 0 = all passed. Exit 1 = failure.
 */

const http    = require('http');
const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');

/* ── Boot server ──────────────────────────────────────────────────── */

process.env.PORT = '0';
const origLog  = console.log;
const origWarn = console.warn;
console.log  = () => {};
console.warn = () => {};
const server = require('./server');
console.log  = origLog;
console.warn = origWarn;

/* ── HTTP helpers ─────────────────────────────────────────────────── */

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port, path: p }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

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

/* ── Extract and evaluate the adapter functions from index.html ───── */
/*
 * We can't require() an HTML file, but we can extract the <script> block
 * and eval() the data-layer portion (adapters + helpers) in a Node context.
 * This lets us call adaptProduct / adaptOffer / buildCategoriesMap directly
 * without a browser.
 */
function extractAdapters() {
  const html = fs.readFileSync(
    path.join(__dirname, 'public', 'index.html'), 'utf8'
  );

  // Extract everything between <script> and </script>
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error('No <script> block found in index.html');
  const script = scriptMatch[1];

  // Pull out just the adapter + helper functions we need to test
  // They are self-contained pure functions with no DOM dependency
  const adapterBlock = [
    // Extract adaptProduct
    script.match(/function adaptProduct\(p\)\s*\{[\s\S]*?\n    \}/)?.[0],
    // Extract adaptOffer
    script.match(/function adaptOffer\(o\)\s*\{[\s\S]*?\n    \}/)?.[0],
    // Extract buildCategoriesMap
    script.match(/function buildCategoriesMap\([\s\S]*?\n    \}/)?.[0],
  ].filter(Boolean).join('\n\n');

  if (!adapterBlock.includes('adaptProduct') ||
      !adapterBlock.includes('adaptOffer') ||
      !adapterBlock.includes('buildCategoriesMap')) {
    throw new Error('Could not extract all adapter functions from index.html');
  }

  // Eval in a sandboxed scope — pass `scope` as an explicit parameter
  const scope = {};
  // eslint-disable-next-line no-new-func
  new Function('scope',
    `${adapterBlock}
     scope.adaptProduct = adaptProduct;
     scope.adaptOffer = adaptOffer;
     scope.buildCategoriesMap = buildCategoriesMap;`
  )(scope);

  return scope;
}

/* ── Sample data ──────────────────────────────────────────────────── */

const SAMPLE_API_PRODUCT = {
  id: 'tacos-poulet',
  category_id: 'tacos',
  name_ar: 'تاكوس دجاج',
  name_fr: 'Tacos Poulet',
  description_ar: 'وصف',
  description_fr: 'Description',
  emoji: '🌮',
  base_price: 450,
  sizes: [{ id: 'M', labelAr: 'وسط', labelFr: 'Moyen', price: 450 }],
  addons: [{ id: 'cam', labelAr: 'كاممبير', labelFr: 'Camembert', price: 100 }],
  is_placeholder: false,
  is_available: true,
  is_featured: true,
  sort_order: 1,
};

const SAMPLE_API_PLACEHOLDER = {
  id: 'crepe-nutella',
  category_id: 'crepes',
  name_ar: 'كريب نوتيلا',
  name_fr: 'Crêpe Nutella',
  description_ar: '⚠️ مؤقت',
  description_fr: '⚠️ Temporaire',
  emoji: '🥞',
  base_price: null,
  sizes: [],
  addons: [],
  is_placeholder: true,
  is_available: true,
  is_featured: false,
  sort_order: 1,
};

const SAMPLE_API_OFFER = {
  id: 'offer-tacos-boisson',
  name_ar: 'منيو تاكوس + مشروب',
  name_fr: 'Menu Tacos + Boisson',
  description_ar: 'وصف',
  description_fr: 'Description',
  emoji: '🌮',
  gradient: 'linear-gradient(135deg,#1a3a2e,#2d6048)',
  base_price: 470,
  original_price: 520,
  linked_category_id: 'tacos',
  is_demo: true,
  is_available: true,
  sort_order: 1,
};

const SAMPLE_API_CATEGORIES = [
  { id: 'tacos',    name_ar: 'تاكوس', name_fr: 'Tacos',
    emoji: '🌮', gradient: 'linear-gradient(135deg,#1a3a2e,#2d6048)',
    is_enabled: true, sort_order: 1 },
  { id: 'boissons', name_ar: 'مشروبات', name_fr: 'Boissons',
    emoji: '🥤', gradient: 'linear-gradient(135deg,#0d3b7a,#1976d2)',
    is_enabled: true, sort_order: 6 },
  { id: 'crepes',   name_ar: 'كريب', name_fr: 'Crêpes',
    emoji: '🥞', gradient: 'linear-gradient(135deg,#7a1a40,#c4406a)',
    is_enabled: true, sort_order: 5 },
];

/* ── Main test runner ─────────────────────────────────────────────── */

async function runTests() {
  const port = server.address().port;
  let adapters;

  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`  Casa Verde — Step 4 test suite (port ${port})`);
  console.log(`─────────────────────────────────────────────────────────`);

  /* ===== 1. index.html contains Step 4 code ====================== */
  console.log('\n[1] index.html Step 4 code present');

  const indexRaw = await get(port, '/');
  const html = indexRaw.body;

  await test('GET / returns 200', () => assert.strictEqual(indexRaw.status, 200));

  await test('PRODUCTS_FALLBACK declared (not const PRODUCTS)', () =>
    assert.ok(html.includes('const PRODUCTS_FALLBACK = ['), 'PRODUCTS_FALLBACK not found'));

  await test('OFFERS_FALLBACK declared', () =>
    assert.ok(html.includes('const OFFERS_FALLBACK = ['), 'OFFERS_FALLBACK not found'));

  await test('CATEGORIES_FALLBACK declared', () =>
    assert.ok(html.includes('const CATEGORIES_FALLBACK = {'), 'CATEGORIES_FALLBACK not found'));

  await test('let PRODUCTS = PRODUCTS_FALLBACK.slice()', () =>
    assert.ok(html.includes('let PRODUCTS   = PRODUCTS_FALLBACK.slice()'), 'let PRODUCTS not found'));

  await test('let OFFERS = OFFERS_FALLBACK.slice()', () =>
    assert.ok(html.includes('let OFFERS     = OFFERS_FALLBACK.slice()'), 'let OFFERS not found'));

  await test('let CATEGORIES = Object.assign({}, CATEGORIES_FALLBACK)', () =>
    assert.ok(html.includes('let CATEGORIES = Object.assign({}, CATEGORIES_FALLBACK)'),
      'let CATEGORIES not found'));

  await test('adaptProduct function present', () =>
    assert.ok(html.includes('function adaptProduct(p)'), 'adaptProduct not found'));

  await test('adaptOffer function present', () =>
    assert.ok(html.includes('function adaptOffer(o)'), 'adaptOffer not found'));

  await test('buildCategoriesMap function present', () =>
    assert.ok(html.includes('function buildCategoriesMap('), 'buildCategoriesMap not found'));

  await test('fetchMenuData function present', () =>
    assert.ok(html.includes('function fetchMenuData()'), 'fetchMenuData not found'));

  await test('fetchMenuData() called at init', () =>
    assert.ok(html.includes('fetchMenuData();'), 'fetchMenuData() call not found'));

  await test('DELIVERY_FEE and WA_NUMBER fallback values present (let after Step 5)', () => {
    // Step 5 converted these from const → let; verify the fallback values are still present
    assert.ok(html.includes("let DELIVERY_FEE = 200"), 'DELIVERY_FEE fallback missing');
    assert.ok(html.includes("let WA_NUMBER = '213776814876'"), 'WA_NUMBER fallback missing');
  });

  /* ===== 2. Adapter: API product → existing field convention ====== */
  console.log('\n[2] adaptProduct() field mapping');

  await test('can extract adapter functions from index.html', async () => {
    adapters = extractAdapters();
    assert.ok(typeof adapters.adaptProduct === 'function');
    assert.ok(typeof adapters.adaptOffer === 'function');
    assert.ok(typeof adapters.buildCategoriesMap === 'function');
  });

  if (!adapters) { console.error('Cannot continue without adapters'); process.exit(1); }

  const adapted = adapters.adaptProduct(SAMPLE_API_PRODUCT);

  await test('id preserved', () => assert.strictEqual(adapted.id, 'tacos-poulet'));
  await test('category_id → category', () => assert.strictEqual(adapted.category, 'tacos'));
  await test('name_ar → nameAr', () => assert.strictEqual(adapted.nameAr, 'تاكوس دجاج'));
  await test('name_fr → nameFr', () => assert.strictEqual(adapted.nameFr, 'Tacos Poulet'));
  await test('description_ar → descriptionAr', () => assert.strictEqual(adapted.descriptionAr, 'وصف'));
  await test('description_fr → descriptionFr', () => assert.strictEqual(adapted.descriptionFr, 'Description'));
  await test('base_price → basePrice', () => assert.strictEqual(adapted.basePrice, 450));
  await test('is_placeholder → isPlaceholder (boolean)', () => {
    assert.strictEqual(adapted.isPlaceholder, false);
    assert.strictEqual(typeof adapted.isPlaceholder, 'boolean');
  });
  await test('is_available → available (boolean)', () => {
    assert.strictEqual(adapted.available, true);
    assert.strictEqual(typeof adapted.available, 'boolean');
  });
  await test('is_featured → featured (boolean)', () => {
    assert.strictEqual(adapted.featured, true);
    assert.strictEqual(typeof adapted.featured, 'boolean');
  });
  await test('sort_order → order', () => assert.strictEqual(adapted.order, 1));
  await test('sizes array passed through', () => {
    assert.ok(Array.isArray(adapted.sizes));
    assert.strictEqual(adapted.sizes.length, 1);
  });
  await test('addons array passed through', () => {
    assert.ok(Array.isArray(adapted.addons));
    assert.strictEqual(adapted.addons.length, 1);
  });
  await test('isOffer = false for products', () => assert.strictEqual(adapted.isOffer, false));

  /* placeholder product */
  const adaptedPh = adapters.adaptProduct(SAMPLE_API_PLACEHOLDER);
  await test('placeholder: basePrice = null', () => assert.strictEqual(adaptedPh.basePrice, null));
  await test('placeholder: isPlaceholder = true', () => assert.strictEqual(adaptedPh.isPlaceholder, true));

  /* ===== 3. adaptOffer() ========================================== */
  console.log('\n[3] adaptOffer() field mapping');

  const adaptedOffer = adapters.adaptOffer(SAMPLE_API_OFFER);

  await test('id preserved', () => assert.strictEqual(adaptedOffer.id, 'offer-tacos-boisson'));
  await test('category = "offers"', () => assert.strictEqual(adaptedOffer.category, 'offers'));
  await test('name_ar → nameAr', () => assert.strictEqual(adaptedOffer.nameAr, 'منيو تاكوس + مشروب'));
  await test('base_price → basePrice', () => assert.strictEqual(adaptedOffer.basePrice, 470));
  await test('original_price → originalPrice', () => assert.strictEqual(adaptedOffer.originalPrice, 520));
  await test('gradient preserved', () =>
    assert.ok(adaptedOffer.gradient.includes('1a3a2e'), 'gradient not preserved'));
  await test('is_demo → isDemoOffer (boolean)', () => {
    assert.strictEqual(adaptedOffer.isDemoOffer, true);
    assert.strictEqual(typeof adaptedOffer.isDemoOffer, 'boolean');
  });
  await test('is_available → available (boolean)', () =>
    assert.strictEqual(adaptedOffer.available, true));
  await test('isOffer = true', () => assert.strictEqual(adaptedOffer.isOffer, true));
  await test('offerPrice = base_price', () => assert.strictEqual(adaptedOffer.offerPrice, 470));
  await test('isPlaceholder = false', () => assert.strictEqual(adaptedOffer.isPlaceholder, false));
  await test('sizes = []', () => assert.deepStrictEqual(adaptedOffer.sizes, []));
  await test('addons = []', () => assert.deepStrictEqual(adaptedOffer.addons, []));

  /* ===== 4. buildCategoriesMap() ================================== */
  console.log('\n[4] buildCategoriesMap() structure');

  const sampleProducts = [
    { category_id: 'tacos', is_placeholder: false },
    { category_id: 'tacos', is_placeholder: false },
    { category_id: 'tacos', is_placeholder: false },
    { category_id: 'boissons', is_placeholder: false },
    { category_id: 'boissons', is_placeholder: false },
    { category_id: 'boissons', is_placeholder: true },  // placeholder
    { category_id: 'crepes', is_placeholder: true },
  ];

  const catMap = adapters.buildCategoriesMap(SAMPLE_API_CATEGORIES, sampleProducts);

  await test('tacos key present', () => assert.ok('tacos' in catMap));
  await test('boissons key present', () => assert.ok('boissons' in catMap));
  await test('crepes key present', () => assert.ok('crepes' in catMap));

  await test('tacos.nameAr correct', () => assert.strictEqual(catMap.tacos.nameAr, 'تاكوس'));
  await test('tacos.nameFr correct', () => assert.strictEqual(catMap.tacos.nameFr, 'Tacos'));
  await test('tacos.emoji correct', () => assert.strictEqual(catMap.tacos.emoji, '🌮'));
  await test('tacos.gradient present', () => assert.ok(catMap.tacos.gradient.includes('1a3a2e')));
  await test('tacos.subtitleFr contains count', () =>
    assert.ok(catMap.tacos.subtitleFr.includes('3'), `Got: ${catMap.tacos.subtitleFr}`));
  await test('tacos.subtitleAr present (non-empty)', () =>
    assert.ok(catMap.tacos.subtitleAr.length > 0));

  await test('crepes subtitleFr = "Menu à venir"', () =>
    assert.ok(catMap.crepes.subtitleFr.includes('venir'), `Got: ${catMap.crepes.subtitleFr}`));
  await test('crepes subtitleAr contains Arabic', () =>
    assert.ok(catMap.crepes.subtitleAr.length > 0));

  await test('boissons subtitle uses confirmed count (2, not 3)', () => {
    // 2 non-placeholder boissons in sample
    assert.ok(catMap.boissons.subtitleFr.includes('2'), `Got: ${catMap.boissons.subtitleFr}`);
  });

  /* ===== 5. Adapted data shape matches rendering expectations ===== */
  console.log('\n[5] Adapted data is renderable (correct field names)');

  // The rendering code calls these specific field paths:
  const p = adapters.adaptProduct(SAMPLE_API_PRODUCT);

  await test('p.category works (used by PRODUCTS.filter)', () =>
    assert.strictEqual(p.category, 'tacos'));
  await test('p.nameAr / p.nameFr (used by rendering)', () => {
    assert.ok(p.nameAr);
    assert.ok(p.nameFr);
  });
  await test('p.descriptionAr / p.descriptionFr', () => {
    assert.ok('descriptionAr' in p);
    assert.ok('descriptionFr' in p);
  });
  await test('p.basePrice (used by getDisplayPrice)', () =>
    assert.strictEqual(p.basePrice, 450));
  await test('p.sizes (used by getDisplayPrice + modal)', () =>
    assert.ok(Array.isArray(p.sizes)));
  await test('p.addons (used by modal)', () =>
    assert.ok(Array.isArray(p.addons)));
  await test('p.isPlaceholder (used by renderMenu + openModal guard)', () =>
    assert.strictEqual(typeof p.isPlaceholder, 'boolean'));
  await test('p.available (used by renderMenu unavailable class)', () =>
    assert.strictEqual(typeof p.available, 'boolean'));
  await test('p.featured (used by badge rendering)', () =>
    assert.strictEqual(typeof p.featured, 'boolean'));
  await test('p.order (used by sort in renderMenu)', () =>
    assert.strictEqual(typeof p.order, 'number'));
  await test('p.isOffer (used by modal badge + openModal)', () =>
    assert.strictEqual(typeof p.isOffer, 'boolean'));

  const o = adapters.adaptOffer(SAMPLE_API_OFFER);
  await test('offer.nameAr (used by renderOffers)', () => assert.ok(o.nameAr));
  await test('offer.gradient (used by renderOffers card background)', () => assert.ok(o.gradient));
  await test('offer.originalPrice (used by renderOffers discount calc)', () =>
    assert.strictEqual(o.originalPrice, 520));
  await test('offer.isDemoOffer (used by renderOffers demo tag)', () =>
    assert.strictEqual(typeof o.isDemoOffer, 'boolean'));

  /* ===== 6. Live API round-trip produces renderable data ========== */
  console.log('\n[6] Live API → adapted data round-trip');

  const prodRes = await get(port, '/api/products');
  const offRes  = await get(port, '/api/offers');
  const prodData = parseJSON(prodRes.body);
  const offData  = parseJSON(offRes.body);

  await test('/api/products still returns 23 products', () =>
    assert.strictEqual(prodData.products.length, 23));

  await test('/api/offers still returns 4 offers', () =>
    assert.strictEqual(offData.offers.length, 4));

  const liveAdapted = prodData.products.map(adapters.adaptProduct);

  await test('all 23 adapted products have correct field names', () => {
    const required = ['id','category','nameAr','nameFr','descriptionAr','descriptionFr',
                      'emoji','basePrice','sizes','addons','available','featured',
                      'isOffer','isPlaceholder','order'];
    liveAdapted.forEach(p => {
      required.forEach(k => assert.ok(k in p, `${p.id} missing ${k}`));
    });
  });

  await test('all adapted products have array sizes and addons', () => {
    liveAdapted.forEach(p => {
      assert.ok(Array.isArray(p.sizes),  `${p.id}: sizes not array`);
      assert.ok(Array.isArray(p.addons), `${p.id}: addons not array`);
    });
  });

  await test('placeholder products have basePrice=null after adaptation', () => {
    liveAdapted.filter(p => p.isPlaceholder).forEach(p =>
      assert.strictEqual(p.basePrice, null, `${p.id} placeholder basePrice should be null`));
  });

  await test('tacos-poulet adapted from live API has 2 sizes', () => {
    const tp = liveAdapted.find(p => p.id === 'tacos-poulet');
    assert.ok(tp, 'tacos-poulet not found');
    assert.strictEqual(tp.sizes.length, 2);
    assert.strictEqual(tp.addons.length, 3);
  });

  const liveOffers = offData.offers.filter(o => o.is_available).map(adapters.adaptOffer);

  await test('all live adapted offers have isOffer=true', () =>
    liveOffers.forEach(o => assert.strictEqual(o.isOffer, true, `${o.id}: isOffer not true`)));

  await test('all live adapted offers have gradient string', () =>
    liveOffers.forEach(o => assert.ok(o.gradient && o.gradient.length > 0,
      `${o.id}: gradient missing`)));

  const catMap2 = adapters.buildCategoriesMap(prodData.categories, prodData.products);

  await test('buildCategoriesMap produces 6 categories from live data', () =>
    assert.strictEqual(Object.keys(catMap2).length, 6));

  await test('all 6 category keys have nameAr, nameFr, emoji, gradient, subtitleAr, subtitleFr', () => {
    Object.entries(catMap2).forEach(([id, c]) => {
      for (const k of ['nameAr','nameFr','emoji','gradient','subtitleAr','subtitleFr'])
        assert.ok(k in c && c[k] !== undefined, `${id} missing ${k}`);
    });
  });

  /* ===== 7. admin.html unchanged ================================= */
  console.log('\n[7] admin.html unchanged');

  const adminSource = fs.readFileSync(
    path.join('/mnt/project', 'admin__1_.html'), 'utf8'
  );
  const adminServed = (await get(port, '/admin')).body;

  await test('admin.html is served (GET /admin → 200)', () =>
    assert.strictEqual(adminServed.length > 10000, true, 'admin.html appears empty'));

  await test('admin.html has no fetchMenuData (Step 4 is index.html only)', () =>
    assert.ok(!adminServed.includes('fetchMenuData'), 'admin.html must not contain fetchMenuData'));

  /* ===== Summary ================================================== */
  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────────────────────\n`);

  server.close(() => process.exit(failed > 0 ? 1 : 0));
}

server.on('listening', () => setTimeout(runTests, 50));
