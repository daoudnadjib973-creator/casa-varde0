'use strict';

/**
 * Casa Verde — Express server
 * Production-ready: serves customer site + admin panel + API.
 *
 * Order persistence is intentionally NOT implemented.
 * WhatsApp is the sole order-dispatch mechanism.
 */

const path    = require('path');
const express = require('express');
const morgan  = require('morgan');
const cors    = require('cors');

/* ── Fail fast on missing critical env vars in production ── */
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET environment variable is required in production.');
    console.error('  Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    console.error('  Then set it in your deployment environment before starting the server.');
    process.exit(1);
  }
}

/* ── Database: initialise schema then seed default data ── */
const { initSchema } = require('./db/schema');
const { seed }       = require('./db/seed');
initSchema();
seed();

/* ── Routers ── */
const authRouter      = require('./routes/auth');
const ordersRouter    = require('./routes/orders');
const productsRouter  = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const offersRouter    = require('./routes/offers');
const settingsRouter  = require('./routes/settings');

/* ── App ── */
const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ── */

/*
 * CORS — in production the origin should be locked to the deployment
 * domain via the ALLOWED_ORIGIN environment variable. During local
 * development, requests from any origin are accepted so that the HTML
 * files can be opened directly from disk as well as from Express.
 */
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* HTTP request logging (concise format in production, dev in development) */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* Parse JSON request bodies */
app.use(express.json());

/* ── Static files ── */
/*
 * Serve everything in public/ as static files.
 * index.html is served at / automatically by Express (index: true, default).
 */
app.use(express.static(path.join(__dirname, 'public')));

/*
 * /admin — serve admin.html explicitly so that navigating to /admin (without
 * a trailing slash or .html) resolves correctly regardless of the static
 * middleware's index-detection behaviour.
 */
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* ── API routes ── */
app.use('/api/auth',       authRouter);
app.use('/api/orders',     ordersRouter);
app.use('/api/products',   productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/offers',     offersRouter);
app.use('/api/settings',   settingsRouter);

/* ── 404 handler for unmatched routes ── */
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ── Global error handler ── */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

/* ── Start ── */
const server = app.listen(PORT, () => {
  const bound = server.address().port;
  console.log(`Casa Verde server running on http://localhost:${bound}`);
  console.log(`  Customer site : http://localhost:${bound}/`);
  console.log(`  Admin panel   : http://localhost:${bound}/admin`);
  console.log(`  Environment   : ${process.env.NODE_ENV || 'development'}`);
});

/*
 * Export both the Express app and the http.Server so that:
 *   - test files can call server.address() to discover the bound port
 *   - test files can call server.close() to shut down cleanly
 */
module.exports = server;
