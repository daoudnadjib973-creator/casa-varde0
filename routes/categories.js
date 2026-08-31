'use strict';

/**
 * /api/categories
 *
 * Public:
 *   GET  /api/categories  — all categories (also bundled in GET /api/products)
 *
 * Admin (require JWT via requireAuth):
 *   POST   /api/categories          — create category
 *   PUT    /api/categories/:id      — update category
 *   DELETE /api/categories/:id      — delete category (blocked if products assigned)
 *   PATCH  /api/categories/:id/toggle-enabled — flip is_enabled
 *   PATCH  /api/categories/:id/reorder        — swap sort_order with neighbour
 */

const { Router }      = require('express');
const db              = require('../db/connection');
const { requireAuth } = require('./middleware/auth');

const router = Router();

/* ── Formatter ────────────────────────────────────────────────────── */

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

/* ── Validation ───────────────────────────────────────────────────── */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateCategoryBody(body, requireId = true) {
  const errors = [];
  if (requireId) {
    if (!body.id || typeof body.id !== 'string' || !SLUG_RE.test(body.id.trim())) {
      errors.push('id: required, lowercase letters/numbers/hyphens only (e.g. "tacos")');
    }
    if (!body.name_ar || typeof body.name_ar !== 'string') errors.push('name_ar: required string');
    if (!body.name_fr || typeof body.name_fr !== 'string') errors.push('name_fr: required string');
  }
  // On PUT, all fields are optional (patch semantics)
  return errors;
}

/* ── Prepared statements ──────────────────────────────────────────── */

const stmts = {
  getAll:       db.prepare('SELECT id, name_ar, name_fr, emoji, gradient, is_enabled, sort_order FROM categories ORDER BY sort_order ASC'),
  getById:      db.prepare('SELECT id, name_ar, name_fr, emoji, gradient, is_enabled, sort_order FROM categories WHERE id = ?'),
  idExists:     db.prepare('SELECT 1 FROM categories WHERE id = ?'),
  productCount: db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?'),
  maxOrder:     db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM categories'),
  insert:       db.prepare(
    `INSERT INTO categories (id, name_ar, name_fr, emoji, gradient, is_enabled, sort_order)
     VALUES (@id, @name_ar, @name_fr, @emoji, @gradient, @is_enabled, @sort_order)`
  ),
  update:       db.prepare(
    `UPDATE categories SET
       name_ar    = @name_ar,
       name_fr    = @name_fr,
       emoji      = @emoji,
       gradient   = @gradient,
       is_enabled = @is_enabled,
       sort_order = @sort_order
     WHERE id = @id`
  ),
  del:          db.prepare('DELETE FROM categories WHERE id = ?'),
  setEnabled:   db.prepare('UPDATE categories SET is_enabled = @v WHERE id = @id'),
  getByOrder:   db.prepare('SELECT id, sort_order FROM categories WHERE sort_order = ?'),
  swapOrder:    db.prepare('UPDATE categories SET sort_order = @newOrder WHERE id = @id'),
};

/* ── GET /api/categories (public) ────────────────────────────────── */

router.get('/', (_req, res) => {
  try {
    res.json({ categories: stmts.getAll.all().map(formatCategory) });
  } catch (err) {
    console.error('[GET /api/categories]', err.message);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

/* ── POST /api/categories (admin) ────────────────────────────────── */

router.post('/', requireAuth, (req, res) => {
  const body   = req.body || {};
  const errors = validateCategoryBody(body, true);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const id = body.id.trim();
  if (stmts.idExists.get(id)) {
    return res.status(409).json({ error: `Category "${id}" already exists` });
  }

  const maxOrder = stmts.maxOrder.get().m;
  const row = {
    id,
    name_ar:    body.name_ar.trim(),
    name_fr:    body.name_fr.trim(),
    emoji:      (body.emoji    || '').trim(),
    gradient:   (body.gradient || '').trim(),
    is_enabled: body.is_enabled !== false ? 1 : 0,
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : maxOrder + 1,
  };

  try {
    stmts.insert.run(row);
    return res.status(201).json({ category: formatCategory(stmts.getById.get(id)) });
  } catch (err) {
    console.error('[POST /api/categories]', err.message);
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

/* ── PUT /api/categories/:id (admin) ─────────────────────────────── */

router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Category "${id}" not found` });

  const body   = req.body || {};
  const errors = validateCategoryBody(body, false);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const row = {
    id,
    name_ar:    body.name_ar    !== undefined ? body.name_ar.trim()    : existing.name_ar,
    name_fr:    body.name_fr    !== undefined ? body.name_fr.trim()    : existing.name_fr,
    emoji:      body.emoji      !== undefined ? body.emoji             : existing.emoji,
    gradient:   body.gradient   !== undefined ? body.gradient          : existing.gradient,
    is_enabled: body.is_enabled !== undefined ? (body.is_enabled ? 1 : 0) : existing.is_enabled,
    sort_order: body.sort_order !== undefined ? body.sort_order        : existing.sort_order,
  };

  try {
    stmts.update.run(row);
    return res.json({ category: formatCategory(stmts.getById.get(id)) });
  } catch (err) {
    console.error('[PUT /api/categories/:id]', err.message);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

/* ── DELETE /api/categories/:id (admin) ──────────────────────────── */

router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Category "${id}" not found` });

  // Block deletion if products are assigned — prevents orphaning products
  const productCount = stmts.productCount.get(id).n;
  if (productCount > 0) {
    return res.status(409).json({
      error: `Cannot delete category "${id}": ${productCount} product(s) are assigned to it. Reassign or delete them first.`,
    });
  }

  try {
    stmts.del.run(id);
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('[DELETE /api/categories/:id]', err.message);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
});

/* ── PATCH /api/categories/:id/toggle-enabled (admin) ────────────── */

router.patch('/:id/toggle-enabled', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Category "${id}" not found` });

  const newVal = existing.is_enabled === 1 ? 0 : 1;
  stmts.setEnabled.run({ v: newVal, id });
  return res.json({ category: formatCategory(stmts.getById.get(id)) });
});

/* ── PATCH /api/categories/:id/reorder (admin) ───────────────────── */
/*
 * Body: { "direction": "up" | "down" }
 * Swaps sort_order with the adjacent category in that direction.
 * "up" = lower sort_order (appears earlier), "down" = higher.
 */

router.patch('/:id/reorder', requireAuth, (req, res) => {
  const { id }        = req.params;
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }

  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Category "${id}" not found` });

  const targetOrder = direction === 'up'
    ? existing.sort_order - 1
    : existing.sort_order + 1;

  const neighbour = stmts.getByOrder.get(targetOrder);
  if (!neighbour) {
    return res.status(400).json({ error: `Cannot move category "${id}" ${direction} — already at boundary` });
  }

  // Swap sort_order values atomically
  const swap = db.transaction(() => {
    stmts.swapOrder.run({ newOrder: targetOrder,          id: existing.id });
    stmts.swapOrder.run({ newOrder: existing.sort_order,  id: neighbour.id });
  });

  try {
    swap();
    return res.json({
      moved:     formatCategory(stmts.getById.get(id)),
      displaced: formatCategory(stmts.getById.get(neighbour.id)),
    });
  } catch (err) {
    console.error('[PATCH /api/categories/:id/reorder]', err.message);
    return res.status(500).json({ error: 'Failed to reorder category' });
  }
});

module.exports = router;
