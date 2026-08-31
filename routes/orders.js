'use strict';

/**
 * /api/orders
 * Phase 6 Step 1 — stub only.
 * Public POST implemented in Step 6.
 * Admin GET / PATCH implemented in Step 9.
 */

const { Router } = require('express');
const router = Router();

/* POST /api/orders — public, called by index.html before opening WhatsApp */
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet — see Phase 6 Step 6' });
});

/* GET /api/orders — admin only */
router.get('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet — see Phase 6 Step 9' });
});

/* PATCH /api/orders/:id/status — admin only */
router.patch('/:id/status', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet — see Phase 6 Step 9' });
});

module.exports = router;
