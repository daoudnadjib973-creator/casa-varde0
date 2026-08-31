'use strict';

/**
 * /api/settings
 *
 * Step 3 — Public GET /api/settings/public implemented.
 * Step 11 — Admin GET / PUT remain stubs.
 *
 * GET /api/settings/public
 *   Returns only the fields that index.html needs to operate:
 *   delivery fee, WhatsApp number, and delivery zone labels.
 *   No authentication required.
 *
 *   Response shape:
 *   {
 *     delivery_fee:     200,
 *     wa_number:        "+213 776 81 48 76",
 *     delivery_zone_ar: "داخل بريان فقط",
 *     delivery_zone_fr: "Berriane uniquement"
 *   }
 *
 *   Design note: returning a flat object (not a key/value array) so that
 *   index.html can read response.delivery_fee directly with no mapping step.
 */

const { Router } = require('express');
const db         = require('../db/connection');

const router = Router();

/* ── Prepared statements ──────────────────────────────────────────── */

const getPublicSettings = db.prepare(`
  SELECT key, value_text, value_int
  FROM   settings
  WHERE  key IN ('delivery_fee','wa_number','delivery_zone_ar','delivery_zone_fr')
`);

/* ── GET /api/settings/public ─────────────────────────────────────── */

router.get('/public', (_req, res) => {
  try {
    const rows = getPublicSettings.all();

    // Build a flat object: prefer value_int for numeric keys, value_text for text keys
    const flat = {};
    rows.forEach(row => {
      flat[row.key] = row.value_int !== null ? row.value_int : row.value_text;
    });

    // Ensure all four keys are present even if a row is missing (fall back to null)
    const PUBLIC_KEYS = ['delivery_fee','wa_number','delivery_zone_ar','delivery_zone_fr'];
    PUBLIC_KEYS.forEach(k => { if (!(k in flat)) flat[k] = null; });

    res.json(flat);
  } catch (err) {
    console.error('[GET /api/settings/public]', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/* ── Admin stubs (Step 11) ────────────────────────────────────────── */

router.get('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet — see Phase 6 Step 11' });
});

router.put('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet — see Phase 6 Step 11' });
});

module.exports = router;
