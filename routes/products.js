'use strict';

/**
 * /api/products
 *
 * Public:
 *   GET  /api/products  — categories + all products (used by index.html)
 *
 * Admin (require JWT via requireAuth):
 *   POST   /api/products          — create product
 *   PUT    /api/products/:id      — update product (full replace of editable fields)
 *   DELETE /api/products/:id      — delete product
 *   PATCH  /api/products/:id/toggle-available — flip is_available
 *   PATCH  /api/products/:id/toggle-featured  — flip is_featured
 */

const { Router }      = require('express');
const db              = require('../db/connection');
const { requireAuth } = require('./middleware/auth');

const router = Router();

/* ── Shared formatters ────────────────────────────────────────────── */

function parseJsonField(str) {
  if (!str || str === '[]') return [];
  try { return JSON.parse(str); } catch { return []; }
}

function formatCategory(row) {
  return {
    id:         row.id,
    name_ar:    row.name_ar,
    name_fr:    row.name_fr,
    emoji:      row.emoji,
    gradient:   row.gradient,
    is_enabled: row.is_enabled === 1,
    sort_order: row.sort_order,
  };
}

function formatProduct(row) {
  return {
    id:             row.id,
    category_id:    row.category_id,
    name_ar:        row.name_ar,
    name_fr:        row.name_fr,
    description_ar: row.description_ar,
    description_fr: row.description_fr,
    emoji:          row.emoji,
    base_price:     row.base_price,
    sizes:          parseJsonField(row.sizes_json),
    addons:         parseJsonField(row.addons_json),
    is_placeholder: row.is_placeholder === 1,
    is_available:   row.is_available   === 1,
    is_featured:    row.is_featured    === 1,
    sort_order:     row.sort_order,
  };
}

/* ── Validation helpers ───────────────────────────────────────────── */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateProductBody(body, requireId = true) {
  const errors = [];

  if (requireId) {
    if (!body.id || typeof body.id !== 'string' || !SLUG_RE.test(body.id.trim())) {
      errors.push('id: required, lowercase letters/numbers/hyphens only (e.g. "tacos-poulet")');
    }
    // On create, category_id and names are required
    if (!body.category_id || typeof body.category_id !== 'string') {
      errors.push('category_id: required string');
    }
    if (!body.name_ar || typeof body.name_ar !== 'string') {
      errors.push('name_ar: required string');
    }
    if (!body.name_fr || typeof body.name_fr !== 'string') {
      errors.push('name_fr: required string');
    }
  }
  // On PUT, all fields are optional (patch semantics) — only validate if provided

  // base_price: null for placeholders, non-negative integer otherwise
  if (body.base_price !== null && body.base_price !== undefined) {
    const p = Number(body.base_price);
    if (!Number.isInteger(p) || p < 0) {
      errors.push('base_price: must be a non-negative integer or null');
    }
  }

  // sizes/addons must be arrays if provided
  for (const field of ['sizes', 'addons']) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      errors.push(`${field}: must be an array`);
    }
  }

  return errors;
}

/* ── Prepared statements ──────────────────────────────────────────── */

const stmts = {
  getCategories: db.prepare(
    'SELECT id, name_ar, name_fr, emoji, gradient, is_enabled, sort_order FROM categories ORDER BY sort_order ASC'
  ),
  getProducts: db.prepare(
    `SELECT id, category_id, name_ar, name_fr, description_ar, description_fr,
            emoji, base_price, sizes_json, addons_json,
            is_placeholder, is_available, is_featured, sort_order
     FROM products ORDER BY category_id ASC, sort_order ASC`
  ),
  getById: db.prepare(
    `SELECT id, category_id, name_ar, name_fr, description_ar, description_fr,
            emoji, base_price, sizes_json, addons_json,
            is_placeholder, is_available, is_featured, sort_order
     FROM products WHERE id = ?`
  ),
  categoryExists: db.prepare('SELECT 1 FROM categories WHERE id = ?'),
  idExists:       db.prepare('SELECT 1 FROM products WHERE id = ?'),
  maxSortOrder:   db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM products WHERE category_id = ?'),
  insert: db.prepare(
    `INSERT INTO products
       (id, category_id, name_ar, name_fr, description_ar, description_fr,
        emoji, base_price, sizes_json, addons_json,
        is_placeholder, is_available, is_featured, sort_order)
     VALUES
       (@id, @category_id, @name_ar, @name_fr, @description_ar, @description_fr,
        @emoji, @base_price, @sizes_json, @addons_json,
        @is_placeholder, @is_available, @is_featured, @sort_order)`
  ),
  update: db.prepare(
    `UPDATE products SET
       category_id    = @category_id,
       name_ar        = @name_ar,
       name_fr        = @name_fr,
       description_ar = @description_ar,
       description_fr = @description_fr,
       emoji          = @emoji,
       base_price     = @base_price,
       sizes_json     = @sizes_json,
       addons_json    = @addons_json,
       is_placeholder = @is_placeholder,
       is_available   = @is_available,
       is_featured    = @is_featured,
       sort_order     = @sort_order
     WHERE id = @id`
  ),
  del:               db.prepare('DELETE FROM products WHERE id = ?'),
  setAvailable:      db.prepare('UPDATE products SET is_available = @v WHERE id = @id'),
  setFeatured:       db.prepare('UPDATE products SET is_featured  = @v WHERE id = @id'),
};

/* ── GET /api/products (public) ───────────────────────────────────── */

router.get('/', (_req, res) => {
  try {
    const categories = stmts.getCategories.all().map(formatCategory);
    const products   = stmts.getProducts.all().map(formatProduct);
    res.json({ categories, products });
  } catch (err) {
    console.error('[GET /api/products]', err.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

/* ── POST /api/products (admin) ───────────────────────────────────── */

router.post('/', requireAuth, (req, res) => {
  const body   = req.body || {};
  const errors = validateProductBody(body, true);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const id = body.id.trim();

  if (stmts.idExists.get(id)) {
    return res.status(409).json({ error: `Product with id "${id}" already exists` });
  }
  if (!stmts.categoryExists.get(body.category_id)) {
    return res.status(400).json({ error: `Category "${body.category_id}" does not exist` });
  }

  const maxOrder = stmts.maxSortOrder.get(body.category_id).m;

  const row = {
    id,
    category_id:    body.category_id,
    name_ar:        body.name_ar.trim(),
    name_fr:        body.name_fr.trim(),
    description_ar: (body.description_ar || '').trim(),
    description_fr: (body.description_fr || '').trim(),
    emoji:          (body.emoji          || '').trim(),
    base_price:     body.base_price !== undefined ? body.base_price : null,
    sizes_json:     JSON.stringify(Array.isArray(body.sizes)  ? body.sizes  : []),
    addons_json:    JSON.stringify(Array.isArray(body.addons) ? body.addons : []),
    is_placeholder: body.is_placeholder ? 1 : 0,
    is_available:   body.is_available   !== false ? 1 : 0,
    is_featured:    body.is_featured    ? 1 : 0,
    sort_order:     Number.isInteger(body.sort_order) ? body.sort_order : maxOrder + 1,
  };

  try {
    stmts.insert.run(row);
    const created = stmts.getById.get(id);
    return res.status(201).json({ product: formatProduct(created) });
  } catch (err) {
    console.error('[POST /api/products]', err.message);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

/* ── PUT /api/products/:id (admin) ───────────────────────────────── */

router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const body   = req.body || {};

  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Product "${id}" not found` });

  const errors = validateProductBody(body, false);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  if (body.category_id && !stmts.categoryExists.get(body.category_id)) {
    return res.status(400).json({ error: `Category "${body.category_id}" does not exist` });
  }

  const row = {
    id,
    category_id:    body.category_id    !== undefined ? body.category_id    : existing.category_id,
    name_ar:        body.name_ar        !== undefined ? body.name_ar.trim() : existing.name_ar,
    name_fr:        body.name_fr        !== undefined ? body.name_fr.trim() : existing.name_fr,
    description_ar: body.description_ar !== undefined ? body.description_ar : existing.description_ar,
    description_fr: body.description_fr !== undefined ? body.description_fr : existing.description_fr,
    emoji:          body.emoji          !== undefined ? body.emoji          : existing.emoji,
    base_price:     body.base_price     !== undefined ? body.base_price     : existing.base_price,
    sizes_json:     Array.isArray(body.sizes)  ? JSON.stringify(body.sizes)  : existing.sizes_json,
    addons_json:    Array.isArray(body.addons) ? JSON.stringify(body.addons) : existing.addons_json,
    is_placeholder: body.is_placeholder !== undefined ? (body.is_placeholder ? 1 : 0) : existing.is_placeholder,
    is_available:   body.is_available   !== undefined ? (body.is_available   ? 1 : 0) : existing.is_available,
    is_featured:    body.is_featured    !== undefined ? (body.is_featured    ? 1 : 0) : existing.is_featured,
    sort_order:     body.sort_order     !== undefined ? body.sort_order               : existing.sort_order,
  };

  try {
    stmts.update.run(row);
    const updated = stmts.getById.get(id);
    return res.json({ product: formatProduct(updated) });
  } catch (err) {
    console.error('[PUT /api/products/:id]', err.message);
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

/* ── DELETE /api/products/:id (admin) ────────────────────────────── */

router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Product "${id}" not found` });

  try {
    stmts.del.run(id);
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('[DELETE /api/products/:id]', err.message);
    return res.status(500).json({ error: 'Failed to delete product' });
  }
});

/* ── PATCH /api/products/:id/toggle-available (admin) ────────────── */

router.patch('/:id/toggle-available', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Product "${id}" not found` });

  const newVal = existing.is_available === 1 ? 0 : 1;
  stmts.setAvailable.run({ v: newVal, id });
  const updated = stmts.getById.get(id);
  return res.json({ product: formatProduct(updated) });
});

/* ── PATCH /api/products/:id/toggle-featured (admin) ─────────────── */

router.patch('/:id/toggle-featured', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Product "${id}" not found` });

  const newVal = existing.is_featured === 1 ? 0 : 1;
  stmts.setFeatured.run({ v: newVal, id });
  const updated = stmts.getById.get(id);
  return res.json({ product: formatProduct(updated) });
});

module.exports = router;
