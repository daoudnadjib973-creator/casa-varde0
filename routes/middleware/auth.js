'use strict';

/**
 * routes/middleware/auth.js
 * JWT verification middleware for admin-only routes.
 *
 * Usage in a router:
 *   const { requireAuth } = require('./middleware/auth');
 *   router.get('/protected', requireAuth, handler);
 *
 * Expects:  Authorization: Bearer <token>
 * On valid token: attaches decoded payload to req.admin and calls next().
 * On missing/invalid/expired token: responds 401 immediately.
 *
 * The JWT_SECRET environment variable must be set in production.
 * In development a fallback warning secret is used so the server
 * starts without an .env file, but a clear warning is printed.
 */

const jwt = require('jsonwebtoken');

/* ── Secret ──────────────────────────────────────────────────────── */

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET environment variable is required in production. ' +
        'Set it before starting the server.'
      );
    }
    /* Development only — warn loudly but keep server running */
    console.warn(
      '[auth] WARNING: JWT_SECRET not set. ' +
      'Using an insecure development fallback. ' +
      'Set JWT_SECRET in your .env file before deploying.'
    );
    return 'casa-verde-dev-secret-NOT-for-production';
  }
  return secret;
}

/* Cache the secret after first call (avoids repeated env reads) */
let _secret = null;
function secret() {
  if (!_secret) _secret = getSecret();
  return _secret;
}

/* ── Middleware ──────────────────────────────────────────────────── */

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      hint:  'Provide a valid JWT in the Authorization: Bearer <token> header',
    });
  }

  const token = header.slice(7); // strip 'Bearer '

  try {
    const payload = jwt.verify(token, secret());
    req.admin = payload; // { id, username, iat, exp }
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Token expired — please log in again'
      : err.name === 'JsonWebTokenError' ? 'Invalid token'
      : 'Authentication failed';

    return res.status(401).json({ error: message });
  }
}

/* ── Token generation (used by login route) ──────────────────────── */

function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '8h' });
}

module.exports = { requireAuth, signToken };
