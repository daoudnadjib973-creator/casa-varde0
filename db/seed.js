'use strict';

/**
 * db/seed.js
 * Populates the database with the default data that matches the
 * hardcoded arrays in index.html and admin.html exactly.
 *
 * Idempotent: each section checks whether rows already exist before
 * inserting. Running seed.js multiple times is safe.
 *
 * Data sources (verified against the live HTML files):
 *   - 6 categories  — mirrors DEFAULT_CATEGORIES in admin.html
 *   - 23 products   — mirrors DEFAULT_PRODUCTS in admin.html / PRODUCTS in index.html
 *   - 4 offers      — mirrors DEFAULT_OFFERS in admin.html / OFFERS in index.html
 *   - 4 settings    — mirrors hardcoded constants in index.html
 *   - 1 admin user  — username 'admin', password seeded from ADMIN_PASSWORD env var
 *                     or the default 'casaverde2025' (change immediately in production)
 */

const bcrypt = require('bcryptjs');
const db     = require('./connection');

/* ── helpers ─────────────────────────────────────────────────────── */

function tableIsEmpty(tableName) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${tableName}`).get().n === 0;
}

/* ── 1. Categories ───────────────────────────────────────────────── */

const DEFAULT_CATEGORIES = [
  { id: 'tacos',     emoji: '🌮', name_ar: 'تاكوس',      name_fr: 'Tacos',
    gradient: 'linear-gradient(135deg,#1a3a2e,#2d6048)', is_enabled: 1, sort_order: 1 },
  { id: 'burgers',   emoji: '🍔', name_ar: 'برغر',        name_fr: 'Burgers',
    gradient: 'linear-gradient(135deg,#8b2020,#c8102e)', is_enabled: 1, sort_order: 2 },
  { id: 'sandwichs', emoji: '🥙', name_ar: 'ساندويشات',   name_fr: 'Sandwichs',
    gradient: 'linear-gradient(135deg,#a07830,#d4a853)', is_enabled: 1, sort_order: 3 },
  { id: 'poutines',  emoji: '🍟', name_ar: 'بوتين',       name_fr: 'Poutines',
    gradient: 'linear-gradient(135deg,#9a5500,#e08020)', is_enabled: 1, sort_order: 4 },
  { id: 'crepes',    emoji: '🥞', name_ar: 'كريب',        name_fr: 'Crêpes',
    gradient: 'linear-gradient(135deg,#7a1a40,#c4406a)', is_enabled: 1, sort_order: 5 },
  { id: 'boissons',  emoji: '🥤', name_ar: 'مشروبات',     name_fr: 'Boissons',
    gradient: 'linear-gradient(135deg,#0d3b7a,#1976d2)', is_enabled: 1, sort_order: 6 },
];

function seedCategories() {
  if (!tableIsEmpty('categories')) {
    console.log('[seed] categories — already seeded, skipping.');
    return;
  }
  const insert = db.prepare(`
    INSERT INTO categories (id, name_ar, name_fr, emoji, gradient, is_enabled, sort_order)
    VALUES (@id, @name_ar, @name_fr, @emoji, @gradient, @is_enabled, @sort_order)
  `);
  const insertMany = db.transaction((rows) => rows.forEach(r => insert.run(r)));
  insertMany(DEFAULT_CATEGORIES);
  console.log(`[seed] categories — inserted ${DEFAULT_CATEGORIES.length} rows.`);
}

/* ── 2. Products ─────────────────────────────────────────────────── */
/*
 * sizes_json and addons_json are stored as JSON strings.
 * base_price is NULL for placeholder products (crepes, coca-cola, pepsi).
 * Total: 3 tacos + 2 burgers + 4 sandwichs + 4 poutines + 3 crepes + 7 boissons = 23
 */

const TACOS_ADDONS = JSON.stringify([
  { id: 'camembert',      labelAr: 'كاممبير',             labelFr: 'Camembert',                   price: 100 },
  { id: 'grat-cam',       labelAr: 'مع كاممبير مذاب',     labelFr: 'Gratiné Camembert',            price: 150 },
  { id: 'grat-cam-ched',  labelAr: 'كاممبير + شيدر مذاب', labelFr: 'Gratiné Camembert + Cheddar', price: 200 },
]);

const DEFAULT_PRODUCTS = [
  /* ── TACOS (3) ── */
  {
    id: 'tacos-poulet', category_id: 'tacos',
    name_ar: 'تاكوس دجاج', name_fr: 'Tacos Poulet',
    description_ar: 'تاكوس مع دجاج مشوي، صلصة خاصة، خضروات طازجة',
    description_fr: 'Tacos garni de poulet grillé, sauce maison et légumes frais',
    emoji: '🌮', base_price: 450,
    sizes_json: JSON.stringify([
      { id: 'M', labelAr: 'وسط', labelFr: 'Moyen', price: 450 },
      { id: 'L', labelAr: 'كبير', labelFr: 'Grand', price: 700 },
    ]),
    addons_json: TACOS_ADDONS,
    is_placeholder: 0, is_available: 1, is_featured: 1, sort_order: 1,
  },
  {
    id: 'tacos-viande', category_id: 'tacos',
    name_ar: 'تاكوس لحم', name_fr: 'Tacos Viande',
    description_ar: 'تاكوس مع لحم بقري مشوي، صلصة خاصة، خضروات طازجة',
    description_fr: 'Tacos garni de viande hachée grillée, sauce maison et légumes frais',
    emoji: '🌮', base_price: 550,
    sizes_json: JSON.stringify([
      { id: 'M', labelAr: 'وسط', labelFr: 'Moyen', price: 550 },
      { id: 'L', labelAr: 'كبير', labelFr: 'Grand', price: 750 },
    ]),
    addons_json: TACOS_ADDONS,
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 2,
  },
  {
    id: 'tacos-mixte', category_id: 'tacos',
    name_ar: 'تاكوس مشكّل', name_fr: 'Tacos Mixte',
    description_ar: 'تاكوس مع دجاج ولحم معاً، صلصة خاصة، خضروات طازجة',
    description_fr: 'Tacos avec poulet et viande, sauce maison et légumes frais',
    emoji: '🌮', base_price: 600,
    sizes_json: JSON.stringify([
      { id: 'M', labelAr: 'وسط', labelFr: 'Moyen', price: 600 },
      { id: 'L', labelAr: 'كبير', labelFr: 'Grand', price: 800 },
    ]),
    addons_json: TACOS_ADDONS,
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 3,
  },

  /* ── BURGERS (2) ── */
  {
    id: 'cheeseburger', category_id: 'burgers',
    name_ar: 'تشيزبرغر', name_fr: 'Cheeseburger',
    description_ar: 'برغر مع شريحة لحم، جبن، خس، طماطم وصلصة',
    description_fr: 'Steak haché, cheddar fondu, laitue, tomate et sauce maison',
    emoji: '🍔', base_price: 250,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 1, sort_order: 1,
  },
  {
    id: 'double-cheeseburger', category_id: 'burgers',
    name_ar: 'دبل تشيزبرغر', name_fr: 'Double Cheeseburger',
    description_ar: 'برغر مزدوج مع شريحتي لحم، جبن مضاعف وصلصة خاصة',
    description_fr: 'Double steak haché, double cheddar fondu et sauce maison',
    emoji: '🍔', base_price: 350,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 2,
  },

  /* ── SANDWICHS (4) ── */
  {
    id: 'sandwich-poulet', category_id: 'sandwichs',
    name_ar: 'ساندويش دجاج', name_fr: 'Sandwich Poulet',
    description_ar: 'ساندويش مع دجاج مشوي وخضروات طازجة',
    description_fr: 'Sandwich au poulet grillé, légumes frais et sauce maison',
    emoji: '🥙', base_price: 300,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 1,
  },
  {
    id: 'sandwich-poulet-crispy', category_id: 'sandwichs',
    name_ar: 'ساندويش دجاج كريسبي', name_fr: 'Sandwich Poulet Crispy',
    description_ar: 'ساندويش مع دجاج مقرمش مقلي وخضروات طازجة',
    description_fr: 'Sandwich au poulet croustillant, légumes frais et sauce maison',
    emoji: '🥙', base_price: 450,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 1, sort_order: 2,
  },
  {
    id: 'sandwich-viande', category_id: 'sandwichs',
    name_ar: 'ساندويش لحم', name_fr: 'Sandwich Viande',
    description_ar: 'ساندويش مع لحم بقري مشوي وخضروات طازجة',
    description_fr: 'Sandwich à la viande hachée grillée et légumes frais',
    emoji: '🥙', base_price: 350,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 3,
  },
  {
    id: 'sandwich-mixte', category_id: 'sandwichs',
    name_ar: 'ساندويش مشكّل', name_fr: 'Sandwich Mixte',
    description_ar: 'ساندويش مع دجاج ولحم معاً، خضروات طازجة وصلصة',
    description_fr: 'Sandwich mixte poulet et viande, légumes frais et sauce maison',
    emoji: '🥙', base_price: 450,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 4,
  },

  /* ── POUTINES (4) ── */
  {
    id: 'poutine-poulet', category_id: 'poutines',
    name_ar: 'بوتين دجاج', name_fr: 'Poutine Poulet',
    description_ar: 'بطاطس مقلية مع دجاج مشوي وصلصة خاصة',
    description_fr: 'Frites maison avec poulet grillé et sauce spéciale',
    emoji: '🍟', base_price: 450,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 1,
  },
  {
    id: 'poutine-poulet-crispy', category_id: 'poutines',
    name_ar: 'بوتين دجاج كريسبي', name_fr: 'Poutine Poulet Crispy',
    description_ar: 'بطاطس مقلية مع دجاج مقرمش وصلصة خاصة',
    description_fr: 'Frites maison avec poulet croustillant et sauce spéciale',
    emoji: '🍟', base_price: 500,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 1, sort_order: 2,
  },
  {
    id: 'poutine-viande', category_id: 'poutines',
    name_ar: 'بوتين لحم', name_fr: 'Poutine Viande',
    description_ar: 'بطاطس مقلية مع لحم بقري مشوي وصلصة خاصة',
    description_fr: 'Frites maison avec viande grillée et sauce spéciale',
    emoji: '🍟', base_price: 550,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 3,
  },
  {
    id: 'poutine-mixte', category_id: 'poutines',
    name_ar: 'بوتين مشكّل', name_fr: 'Poutine Mixte',
    description_ar: 'بطاطس مقلية مع دجاج ولحم معاً وصلصة خاصة',
    description_fr: 'Frites maison avec poulet et viande mixte, sauce spéciale',
    emoji: '🍟', base_price: 600,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 4,
  },

  /* ── CRÊPES (3) — placeholders, base_price NULL ── */
  {
    id: 'crepe-nutella', category_id: 'crepes',
    name_ar: 'كريب نوتيلا', name_fr: 'Crêpe Nutella',
    description_ar: '⚠️ منتج تجريبي — سيتم تحديثه عند استلام القائمة النهائية',
    description_fr: '⚠️ Produit temporaire — sera mis à jour à réception du menu final',
    emoji: '🥞', base_price: null,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 1, is_available: 1, is_featured: 0, sort_order: 1,
  },
  {
    id: 'crepe-fraise', category_id: 'crepes',
    name_ar: 'كريب فراولة', name_fr: 'Crêpe Fraise',
    description_ar: '⚠️ منتج تجريبي — سيتم تحديثه عند استلام القائمة النهائية',
    description_fr: '⚠️ Produit temporaire — sera mis à jour à réception du menu final',
    emoji: '🥞', base_price: null,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 1, is_available: 1, is_featured: 0, sort_order: 2,
  },
  {
    id: 'crepe-banane', category_id: 'crepes',
    name_ar: 'كريب موز', name_fr: 'Crêpe Banane',
    description_ar: '⚠️ منتج تجريبي — سيتم تحديثه عند استلام القائمة النهائية',
    description_fr: '⚠️ Produit temporaire — sera mis à jour à réception du menu final',
    emoji: '🥞', base_price: null,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 1, is_available: 1, is_featured: 0, sort_order: 3,
  },

  /* ── BOISSONS (7) ── */
  {
    id: 'hamoud-cola', category_id: 'boissons',
    name_ar: 'حمود كولا', name_fr: 'Hamoud Cola',
    description_ar: 'مشروب غازي', description_fr: 'Boisson gazeuse',
    emoji: '🥤', base_price: 70,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 1,
  },
  {
    id: 'hamoud-blanche', category_id: 'boissons',
    name_ar: 'حمود بلانش', name_fr: 'Hamoud Blanche',
    description_ar: 'مشروب غازي بطعم الليمون', description_fr: 'Boisson gazeuse au citron',
    emoji: '🥤', base_price: 70,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 2,
  },
  {
    id: 'slim-orange', category_id: 'boissons',
    name_ar: 'سليم أورانج', name_fr: 'Slim Orange',
    description_ar: 'عصير برتقال غازي', description_fr: "Jus d'orange gazeux",
    emoji: '🧃', base_price: 70,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 3,
  },
  {
    id: 'selecto', category_id: 'boissons',
    name_ar: 'سيلكتو', name_fr: 'Selecto',
    description_ar: 'مشروب غازي بالفانيليا', description_fr: 'Boisson gazeuse à la vanille',
    emoji: '🥤', base_price: 70,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 4,
  },
  {
    id: 'jus-local', category_id: 'boissons',
    name_ar: 'عصير طبيعي', name_fr: 'Jus de fruit local',
    description_ar: 'مشروب طبيعي بالفواكه المحلية',
    description_fr: 'Boisson naturelle aux fruits locaux',
    emoji: '🧃', base_price: 70,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 0, is_available: 1, is_featured: 0, sort_order: 5,
  },
  /* Coca-Cola — placeholder, base_price NULL */
  {
    id: 'coca-cola', category_id: 'boissons',
    name_ar: 'كوكا كولا', name_fr: 'Coca-Cola',
    description_ar: '⚠️ السعر قيد التأكيد', description_fr: '⚠️ Prix à confirmer',
    emoji: '🥤', base_price: null,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 1, is_available: 1, is_featured: 0, sort_order: 6,
  },
  /* Pepsi — placeholder, base_price NULL */
  {
    id: 'pepsi', category_id: 'boissons',
    name_ar: 'بيبسي', name_fr: 'Pepsi',
    description_ar: '⚠️ السعر قيد التأكيد', description_fr: '⚠️ Prix à confirmer',
    emoji: '🥤', base_price: null,
    sizes_json: '[]', addons_json: '[]',
    is_placeholder: 1, is_available: 1, is_featured: 0, sort_order: 7,
  },
];

function seedProducts() {
  if (!tableIsEmpty('products')) {
    console.log('[seed] products — already seeded, skipping.');
    return;
  }
  const insert = db.prepare(`
    INSERT INTO products (
      id, category_id, name_ar, name_fr, description_ar, description_fr,
      emoji, base_price, sizes_json, addons_json,
      is_placeholder, is_available, is_featured, sort_order
    ) VALUES (
      @id, @category_id, @name_ar, @name_fr, @description_ar, @description_fr,
      @emoji, @base_price, @sizes_json, @addons_json,
      @is_placeholder, @is_available, @is_featured, @sort_order
    )
  `);
  const insertMany = db.transaction((rows) => rows.forEach(r => insert.run(r)));
  insertMany(DEFAULT_PRODUCTS);
  console.log(`[seed] products — inserted ${DEFAULT_PRODUCTS.length} rows.`);
}

/* ── 3. Offers ───────────────────────────────────────────────────── */

const DEFAULT_OFFERS = [
  {
    id: 'offer-tacos-boisson',
    name_ar: 'منيو تاكوس + مشروب', name_fr: 'Menu Tacos + Boisson',
    description_ar: 'تاكوس مع مشروب غازي بسعر خاص',
    description_fr: "Un tacos accompagné d'une boisson gazeuse à prix spécial",
    emoji: '🌮', gradient: 'linear-gradient(135deg,#1a3a2e,#2d6048)',
    base_price: 470, original_price: 520,
    linked_category_id: 'tacos', is_demo: 1, is_available: 1, sort_order: 1,
  },
  {
    id: 'offer-duo-burger',
    name_ar: 'ديو برغر', name_fr: 'Duo Burger',
    description_ar: 'صحن مزدوج من البرغر لمشاركة الطعم مع صديق',
    description_fr: 'Deux burgers à partager, prix réduit pour le duo',
    emoji: '🍔', gradient: 'linear-gradient(135deg,#8b2020,#c8102e)',
    base_price: 420, original_price: 500,
    linked_category_id: 'burgers', is_demo: 1, is_available: 1, sort_order: 2,
  },
  {
    id: 'offer-sandwich-poutine',
    name_ar: 'ساندويش + بوتين', name_fr: 'Sandwich + Poutine',
    description_ar: 'ساندويش مع طبق بوتين بسعر مخفض',
    description_fr: "Un sandwich accompagné d'une poutine à prix réduit",
    emoji: '🥙', gradient: 'linear-gradient(135deg,#a07830,#d4a853)',
    base_price: 750, original_price: 900,
    linked_category_id: 'sandwichs', is_demo: 1, is_available: 1, sort_order: 3,
  },
  {
    id: 'offer-pack-famille',
    name_ar: 'باك العائلة', name_fr: 'Pack Famille',
    description_ar: 'باك مخصص للعائلة يجمع عدة أصناف بسعر مميز',
    description_fr: "Un pack pensé pour la famille, plusieurs articles à prix avantageux",
    emoji: '🎉', gradient: 'linear-gradient(135deg,#7a1a40,#c4406a)',
    base_price: 999, original_price: 1240,
    linked_category_id: null, is_demo: 1, is_available: 1, sort_order: 4,
  },
];

function seedOffers() {
  if (!tableIsEmpty('offers')) {
    console.log('[seed] offers — already seeded, skipping.');
    return;
  }
  const insert = db.prepare(`
    INSERT INTO offers (
      id, name_ar, name_fr, description_ar, description_fr,
      emoji, gradient, base_price, original_price,
      linked_category_id, is_demo, is_available, sort_order
    ) VALUES (
      @id, @name_ar, @name_fr, @description_ar, @description_fr,
      @emoji, @gradient, @base_price, @original_price,
      @linked_category_id, @is_demo, @is_available, @sort_order
    )
  `);
  const insertMany = db.transaction((rows) => rows.forEach(r => insert.run(r)));
  insertMany(DEFAULT_OFFERS);
  console.log(`[seed] offers — inserted ${DEFAULT_OFFERS.length} rows.`);
}

/* ── 4. Settings ─────────────────────────────────────────────────── */

const DEFAULT_SETTINGS = [
  { key: 'delivery_fee',     value_int: 200,   value_text: null },
  { key: 'wa_number',        value_int: null,  value_text: '+213 776 81 48 76' },
  { key: 'delivery_zone_ar', value_int: null,  value_text: 'داخل بريان فقط' },
  { key: 'delivery_zone_fr', value_int: null,  value_text: 'Berriane uniquement' },
];

function seedSettings() {
  if (!tableIsEmpty('settings')) {
    console.log('[seed] settings — already seeded, skipping.');
    return;
  }
  const insert = db.prepare(`
    INSERT INTO settings (key, value_int, value_text)
    VALUES (@key, @value_int, @value_text)
  `);
  const insertMany = db.transaction((rows) => rows.forEach(r => insert.run(r)));
  insertMany(DEFAULT_SETTINGS);
  console.log(`[seed] settings — inserted ${DEFAULT_SETTINGS.length} rows.`);
}

/* ── 5. Admin user ───────────────────────────────────────────────── */

function seedAdminUser() {
  if (!tableIsEmpty('admin_users')) {
    console.log('[seed] admin_users — already seeded, skipping.');
    return;
  }
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'casaverde2025';

  if (password === 'casaverde2025' && process.env.NODE_ENV === 'production') {
    console.warn(
      '[seed] WARNING: Using the default admin password in production. ' +
      'Set the ADMIN_PASSWORD environment variable to a strong password immediately.'
    );
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)'
  ).run(username, hash);
  console.log(`[seed] admin_users — inserted user '${username}'.`);
}

/* ── Run all seeds ───────────────────────────────────────────────── */

function seed() {
  // Run inside a single transaction so a partial failure leaves the DB clean
  const runAll = db.transaction(() => {
    seedCategories();
    seedProducts();
    seedOffers();
    seedSettings();
    seedAdminUser();
  });
  runAll();
  console.log('[seed] Database seeding complete.');
}

module.exports = { seed };
