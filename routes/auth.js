'use strict';

/**
 * /api/auth
 * Phase 6 Step 6 — Admin authentication implemented.
 *
 * POST /api/auth/login
 *   Body: { "username": "...", "password": "..." }
 *
 *   Success (200):
 *     { "token": "<JWT>", "username": "admin", "expiresIn": "8h" }
 *
 *   Failure (401):
 *     { "error": "Invalid username or password" }
 *
 *   Failure (400):
 *     { "error": "username and password are required" }
 *
 * GET /api/auth/verify
 *   Requires: Authorization: Bearer <token>
 *   Used by admin.html on load to check whether a stored token is
 *   still valid without triggering a full page reload.
 *   Success (200): { "ok": true, "username": "..." }
 *   Failure (401): standard requireAuth response
 *
 * Security measures:
 *   - Rate-limited: 5 attempts per 15 minutes per IP (express-rate-limit)
 *   - Password verified with bcrypt.compare — timing-safe
 *   - Generic error message on bad credentials (no username-enumeration leak)
 *   - JWT signed with HS256, 8-hour expiry
 *   - JWT_SECRET loaded from environment variable (never hardcoded)
 */

const { Router }    = require('express');
const rateLimit     = require('express-rate-limit');
const bcrypt        = require('bcryptjs');
const db            = require('../db/connection');
const { signToken, requireAuth } = require('./middleware/auth');

const router = Router();

/* ── Rate limiter: max 5 login attempts per IP per 15 minutes ─────── */
/*
 * Set DISABLE_RATE_LIMIT=1 in test environments to prevent the limiter
 * from firing during sequential test runs that intentionally send bad
 * credentials. Never set this in production.
 */
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              process.env.DISABLE_RATE_LIMIT ? 1000 : 5,
  standardHeaders:  true,
  legacyHeaders:    false,
  skipSuccessfulRequests: true,      // only count failures toward the limit
  message: {
    error: 'Too many login attempts. Please wait 15 minutes and try again.',
  },
  keyGenerator: (req) => req.ip || 'unknown',
});

/* ── Prepared statement ──────────────────────────────────────────── */

const getAdminUser = db.prepare(
  'SELECT id, username, password_hash FROM admin_users WHERE username = ?'
);

/* ── POST /api/auth/login ────────────────────────────────────────── */

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  /* 1. Input validation */
  if (!username || typeof username !== 'string' ||
      !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }

  /* 2. Trim whitespace */
  const usernameTrimmed = username.trim();
  const passwordTrimmed = password.trim();

  if (!usernameTrimmed || !passwordTrimmed) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  /* 3. Look up the user */
  const user = getAdminUser.get(usernameTrimmed);

  /* 4. Verify password — dummy compare when user not found to prevent
        timing attacks that could reveal whether a username exists */
  const DUMMY_HASH = '$2a$12$notarealhashjustfortimingjRpGaqFI.1234567890abcdef';
  const hashToCheck = user ? user.password_hash : DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(passwordTrimmed, hashToCheck);

  if (!user || !passwordMatch) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  /* 5. Issue JWT */
  const token = signToken({ id: user.id, username: user.username });

  return res.status(200).json({
    token,
    username: user.username,
    expiresIn: '8h',
  });
});

/* ── GET /api/auth/verify ────────────────────────────────────────── */
/*
 * Lightweight token-validation endpoint used by admin.html on load.
 * requireAuth handles the 401 on bad/missing/expired tokens.
 * On valid token: returns 200 with the username from the payload.
 */
router.get('/verify', requireAuth, (req, res) => {
  res.status(200).json({ ok: true, username: req.admin.username });
});

module.exports = router;
