'use strict';

/**
 * /api/offers
 *
 * Public:
 *   GET  /api/offers  — all offers (used by index.html)
 *
 * Admin (require JWT via requireAuth):
 *   POST   /api/offers          — create offer
 *   PUT    /api/offers/:id      — update offer
 *   DELETE /api/offers/:id      — delete offer
 *   PATCH  /api/offers/:id/toggle-available — flip is_available
 */

const { Router }      = require('express');
const db              = require('../db/connection');
const { requireAuth } = require('./middleware/auth');

const router = Router();

/* ── Formatter ────────────────────────────────────────────────────── */

function formatOffer(row) {
  return {
    id:                 row.id,
    name_ar:            row.name_ar,
    name_fr:            row.name_fr,
    description_ar:     row.description_ar,
    description_fr:     row.description_fr,
    emoji:              row.emoji,
    gradient:           row.gradient,
    base_price:         row.base_price,
    original_price:     row.original_price,
    linked_category_id: row.linked_category_id,
    is_demo:            row.is_demo      === 1,
    is_available:       row.is_available === 1,
    sort_order:         row.sort_order,
  };
}

/* ── Validation ───────────────────────────────────────────────────── */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateOfferBody(body, requireId = true) {
  const errors = [];
  if (requireId) {
    if (!body.id || typeof body.id !== 'string' || !SLUG_RE.test(body.id.trim())) {
      errors.push('id: required, lowercase letters/numbers/hyphens only (e.g. "offer-tacos-boisson")');
    }
    if (!body.name_ar || typeof body.name_ar !== 'string') errors.push('name_ar: required string');
    if (!body.name_fr || typeof body.name_fr !== 'string') errors.push('name_fr: required string');
  }

  // Price fields: validate when present (required only on create)
  const bpProvided = body.base_price !== undefined;
  const opProvided = body.original_price !== undefined;

  if (requireId || bpProvided) {
    const bp = Number(body.base_price);
    if (bpProvided && (!Number.isInteger(bp) || bp < 0))
      errors.push('base_price: required non-negative integer');
    if (requireId && !bpProvided)
      errors.push('base_price: required non-negative integer');
  }
  if (requireId || opProvided) {
    const op = Number(body.original_price);
    if (opProvided && (!Number.isInteger(op) || op < 0))
      errors.push('original_price: required non-negative integer');
    if (requireId && !opProvided)
      errors.push('original_price: required non-negative integer');
  }

  // Cross-field price constraint (only when both values are available)
  const bp = bpProvided ? Number(body.base_price) : null;
  const op = opProvided ? Number(body.original_price) : null;
  if (bp !== null && op !== null && !isNaN(bp) && !isNaN(op) && op < bp) {
    errors.push('original_price must be >= base_price (discount constraint)');
  }
  return errors;
}

/* ── Prepared statements ──────────────────────────────────────────── */

const stmts = {
  getAll:         db.prepare(
    `SELECT id, name_ar, name_fr, description_ar, description_fr,
            emoji, gradient, base_price, original_price,
            linked_category_id, is_demo, is_available, sort_order
     FROM offers ORDER BY sort_order ASC`
  ),
  getById:        db.prepare(
    `SELECT id, name_ar, name_fr, description_ar, description_fr,
            emoji, gradient, base_price, original_price,
            linked_category_id, is_demo, is_available, sort_order
     FROM offers WHERE id = ?`
  ),
  idExists:       db.prepare('SELECT 1 FROM offers WHERE id = ?'),
  categoryExists: db.prepare('SELECT 1 FROM categories WHERE id = ?'),
  maxOrder:       db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM offers'),
  insert:         db.prepare(
    `INSERT INTO offers
       (id, name_ar, name_fr, description_ar, description_fr,
        emoji, gradient, base_price, original_price,
        linked_category_id, is_demo, is_available, sort_order)
     VALUES
       (@id, @name_ar, @name_fr, @description_ar, @description_fr,
        @emoji, @gradient, @base_price, @original_price,
        @linked_category_id, @is_demo, @is_available, @sort_order)`
  ),
  update:         db.prepare(
    `UPDATE offers SET
       name_ar            = @name_ar,
       name_fr            = @name_fr,
       description_ar     = @description_ar,
       description_fr     = @description_fr,
       emoji              = @emoji,
       gradient           = @gradient,
       base_price         = @base_price,
       original_price     = @original_price,
       linked_category_id = @linked_category_id,
       is_demo            = @is_demo,
       is_available       = @is_available,
       sort_order         = @sort_order
     WHERE id = @id`
  ),
  del:            db.prepare('DELETE FROM offers WHERE id = ?'),
  setAvailable:   db.prepare('UPDATE offers SET is_available = @v WHERE id = @id'),
};

/* ── GET /api/offers (public) ────────────────────────────────────── */

router.get('/', (_req, res) => {
  try {
    res.json({ offers: stmts.getAll.all().map(formatOffer) });
  } catch (err) {
    console.error('[GET /api/offers]', err.message);
    res.status(500).json({ error: 'Failed to load offers' });
  }
});

/* ── POST /api/offers (admin) ────────────────────────────────────── */

router.post('/', requireAuth, (req, res) => {
  const body   = req.body || {};
  const errors = validateOfferBody(body, true);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const id = body.id.trim();
  if (stmts.idExists.get(id)) {
    return res.status(409).json({ error: `Offer "${id}" already exists` });
  }

  // Validate linked_category_id if provided
  if (body.linked_category_id && !stmts.categoryExists.get(body.linked_category_id)) {
    return res.status(400).json({ error: `Category "${body.linked_category_id}" does not exist` });
  }

  const maxOrder = stmts.maxOrder.get().m;
  const row = {
    id,
    name_ar:            body.name_ar.trim(),
    name_fr:            body.name_fr.trim(),
    description_ar:     (body.description_ar     || '').trim(),
    description_fr:     (body.description_fr     || '').trim(),
    emoji:              (body.emoji              || '').trim(),
    gradient:           (body.gradient           || '').trim(),
    base_price:         Number(body.base_price),
    original_price:     Number(body.original_price),
    linked_category_id: body.linked_category_id || null,
    is_demo:            body.is_demo     !== false ? 1 : 0,
    is_available:       body.is_available !== false ? 1 : 0,
    sort_order:         Number.isInteger(body.sort_order) ? body.sort_order : maxOrder + 1,
  };

  try {
    stmts.insert.run(row);
    return res.status(201).json({ offer: formatOffer(stmts.getById.get(id)) });
  } catch (err) {
    console.error('[POST /api/offers]', err.message);
    // SQLite CHECK constraint violation (original_price >= base_price)
    if (err.message.includes('CHECK')) {
      return res.status(400).json({ error: 'original_price must be >= base_price' });
    }
    return res.status(500).json({ error: 'Failed to create offer' });
  }
});

/* ── PUT /api/offers/:id (admin) ─────────────────────────────────── */

router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Offer "${id}" not found` });

  const body   = req.body || {};
  const errors = validateOfferBody(body, false);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  if (body.linked_category_id && !stmts.categoryExists.get(body.linked_category_id)) {
    return res.status(400).json({ error: `Category "${body.linked_category_id}" does not exist` });
  }

  const newBp = body.base_price     !== undefined ? Number(body.base_price)     : existing.base_price;
  const newOp = body.original_price !== undefined ? Number(body.original_price) : existing.original_price;
  if (newOp < newBp) {
    return res.status(400).json({ error: 'original_price must be >= base_price' });
  }

  const row = {
    id,
    name_ar:            body.name_ar            !== undefined ? body.name_ar.trim()    : existing.name_ar,
    name_fr:            body.name_fr            !== undefined ? body.name_fr.trim()    : existing.name_fr,
    description_ar:     body.description_ar     !== undefined ? body.description_ar    : existing.description_ar,
    description_fr:     body.description_fr     !== undefined ? body.description_fr    : existing.description_fr,
    emoji:              body.emoji              !== undefined ? body.emoji              : existing.emoji,
    gradient:           body.gradient           !== undefined ? body.gradient           : existing.gradient,
    base_price:         newBp,
    original_price:     newOp,
    linked_category_id: body.linked_category_id !== undefined ? (body.linked_category_id || null) : existing.linked_category_id,
    is_demo:            body.is_demo            !== undefined ? (body.is_demo    ? 1 : 0) : existing.is_demo,
    is_available:       body.is_available       !== undefined ? (body.is_available ? 1 : 0) : existing.is_available,
    sort_order:         body.sort_order         !== undefined ? body.sort_order           : existing.sort_order,
  };

  try {
    stmts.update.run(row);
    return res.json({ offer: formatOffer(stmts.getById.get(id)) });
  } catch (err) {
    console.error('[PUT /api/offers/:id]', err.message);
    if (err.message.includes('CHECK')) {
      return res.status(400).json({ error: 'original_price must be >= base_price' });
    }
    return res.status(500).json({ error: 'Failed to update offer' });
  }
});

/* ── DELETE /api/offers/:id (admin) ──────────────────────────────── */

router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!stmts.getById.get(id)) return res.status(404).json({ error: `Offer "${id}" not found` });

  try {
    stmts.del.run(id);
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('[DELETE /api/offers/:id]', err.message);
    return res.status(500).json({ error: 'Failed to delete offer' });
  }
});

/* ── PATCH /api/offers/:id/toggle-available (admin) ──────────────── */

router.patch('/:id/toggle-available', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = stmts.getById.get(id);
  if (!existing) return res.status(404).json({ error: `Offer "${id}" not found` });

  const newVal = existing.is_available === 1 ? 0 : 1;
  stmts.setAvailable.run({ v: newVal, id });
  return res.json({ offer: formatOffer(stmts.getById.get(id)) });
});

module.exports = router;
