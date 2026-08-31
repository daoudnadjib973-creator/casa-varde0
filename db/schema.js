'use strict';

/**
 * db/schema.js
 * Creates all tables and indexes if they do not already exist.
 * Safe to run on every server start (all statements use IF NOT EXISTS).
 *
 * Table overview
 * ─────────────────────────────────────────────
 *  categories   — the six menu sections (tacos, burgers, …)
 *  products     — individual menu items, each belonging to one category
 *  offers       — combo deals / promotional bundles
 *  orders       — one row per customer order submitted via index.html
 *  order_items  — the line items inside each order (normalised)
 *  settings     — key/value store for delivery fee, WA number, zone labels
 *  admin_users  — single admin account (bcrypt-hashed password)
 */

const db = require('./connection');

function initSchema() {
  db.exec(`
    /* ── categories ──────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT    PRIMARY KEY,          -- e.g. 'tacos'
      name_ar     TEXT    NOT NULL,
      name_fr     TEXT    NOT NULL,
      emoji       TEXT    NOT NULL DEFAULT '',
      gradient    TEXT    NOT NULL DEFAULT '',
      is_enabled  INTEGER NOT NULL DEFAULT 1    CHECK (is_enabled IN (0,1)),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_categories_sort
      ON categories (sort_order);

    /* ── products ────────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS products (
      id             TEXT    PRIMARY KEY,          -- e.g. 'tacos-poulet'
      category_id    TEXT    NOT NULL
                             REFERENCES categories(id) ON DELETE RESTRICT,
      name_ar        TEXT    NOT NULL,
      name_fr        TEXT    NOT NULL,
      description_ar TEXT    NOT NULL DEFAULT '',
      description_fr TEXT    NOT NULL DEFAULT '',
      emoji          TEXT    NOT NULL DEFAULT '',
      base_price     INTEGER,                      -- NULL for placeholder products
      sizes_json     TEXT    NOT NULL DEFAULT '[]',-- JSON array of size objects
      addons_json    TEXT    NOT NULL DEFAULT '[]',-- JSON array of addon objects
      is_placeholder INTEGER NOT NULL DEFAULT 0    CHECK (is_placeholder IN (0,1)),
      is_available   INTEGER NOT NULL DEFAULT 1    CHECK (is_available   IN (0,1)),
      is_featured    INTEGER NOT NULL DEFAULT 0    CHECK (is_featured    IN (0,1)),
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_category
      ON products (category_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_products_available
      ON products (is_available);

    /* ── offers ──────────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS offers (
      id                 TEXT    PRIMARY KEY,      -- e.g. 'offer-tacos-boisson'
      name_ar            TEXT    NOT NULL,
      name_fr            TEXT    NOT NULL,
      description_ar     TEXT    NOT NULL DEFAULT '',
      description_fr     TEXT    NOT NULL DEFAULT '',
      emoji              TEXT    NOT NULL DEFAULT '',
      gradient           TEXT    NOT NULL DEFAULT '',
      base_price         INTEGER NOT NULL,         -- discounted price charged
      original_price     INTEGER NOT NULL,         -- full price (for ribbon display)
      linked_category_id TEXT    REFERENCES categories(id) ON DELETE SET NULL,
      is_demo            INTEGER NOT NULL DEFAULT 1 CHECK (is_demo      IN (0,1)),
      is_available       INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
      sort_order         INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      CHECK (original_price >= base_price)
    );

    CREATE INDEX IF NOT EXISTS idx_offers_available
      ON offers (is_available, sort_order);

    /* ── orders ──────────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS orders (
      id              TEXT    PRIMARY KEY,   -- e.g. 'ord_1723456789_a3f'
      customer_name   TEXT    NOT NULL,
      customer_phone  TEXT    NOT NULL,
      method          TEXT    NOT NULL       CHECK (method IN ('pickup','delivery')),
      address         TEXT    NOT NULL DEFAULT '',  -- empty string for pickup
      subtotal        INTEGER NOT NULL,      -- sum of line items, DA
      delivery_fee    INTEGER NOT NULL DEFAULT 0,
      total           INTEGER NOT NULL,      -- subtotal + delivery_fee
      status          TEXT    NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','preparing','done','cancelled')),
      lang            TEXT    NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar','fr')),
      wa_sent         INTEGER NOT NULL DEFAULT 0    CHECK (wa_sent IN (0,1)),
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status
      ON orders (status);

    CREATE INDEX IF NOT EXISTS idx_orders_created
      ON orders (created_at DESC);

    /* ── order_items ─────────────────────────────────────────────── */
    /*
     * Normalised line items. Storing name_ar/name_fr as snapshot columns
     * preserves the display name even if the product is later edited or
     * deleted (the order history must remain accurate).
     */
    CREATE TABLE IF NOT EXISTS order_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        TEXT    NOT NULL
                              REFERENCES orders(id) ON DELETE CASCADE,
      product_id      TEXT,                  -- NULL-able: product may be deleted later
      name_ar         TEXT    NOT NULL,      -- snapshot at time of order
      name_fr         TEXT    NOT NULL,
      emoji           TEXT    NOT NULL DEFAULT '',
      size_id         TEXT    NOT NULL DEFAULT '',
      size_label_ar   TEXT    NOT NULL DEFAULT '',
      size_label_fr   TEXT    NOT NULL DEFAULT '',
      addons_json     TEXT    NOT NULL DEFAULT '[]', -- snapshot of selected addons
      qty             INTEGER NOT NULL DEFAULT 1     CHECK (qty > 0),
      unit_price      INTEGER NOT NULL,      -- price per unit including selected addons
      line_total      INTEGER NOT NULL       -- unit_price * qty
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order
      ON order_items (order_id);

    /* ── settings ────────────────────────────────────────────────── */
    /*
     * Key/value store. Integer and text values are in separate columns so
     * the application never has to parse stored values — it reads the
     * appropriate column for each key.
     *
     * Keys used:
     *   delivery_fee       (value_int)   e.g. 200
     *   wa_number          (value_text)  e.g. '+213 776 81 48 76'
     *   delivery_zone_ar   (value_text)  e.g. 'داخل بريان فقط'
     *   delivery_zone_fr   (value_text)  e.g. 'Berriane uniquement'
     */
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value_text TEXT,
      value_int  INTEGER,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    /* ── admin_users ─────────────────────────────────────────────── */
    /*
     * Single admin account. The password is stored as a bcrypt hash;
     * the plaintext is never persisted. Seeded once by seed.js.
     */
    CREATE TABLE IF NOT EXISTS admin_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,        -- bcrypt hash, cost factor 12
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    /* ── Triggers: keep updated_at current on every UPDATE ───────── */

    CREATE TRIGGER IF NOT EXISTS trg_categories_updated_at
      AFTER UPDATE ON categories
      FOR EACH ROW
      BEGIN
        UPDATE categories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = OLD.id;
      END;

    CREATE TRIGGER IF NOT EXISTS trg_products_updated_at
      AFTER UPDATE ON products
      FOR EACH ROW
      BEGIN
        UPDATE products SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = OLD.id;
      END;

    CREATE TRIGGER IF NOT EXISTS trg_offers_updated_at
      AFTER UPDATE ON offers
      FOR EACH ROW
      BEGIN
        UPDATE offers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = OLD.id;
      END;

    CREATE TRIGGER IF NOT EXISTS trg_orders_updated_at
      AFTER UPDATE ON orders
      FOR EACH ROW
      BEGIN
        UPDATE orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = OLD.id;
      END;

    CREATE TRIGGER IF NOT EXISTS trg_admin_users_updated_at
      AFTER UPDATE ON admin_users
      FOR EACH ROW
      BEGIN
        UPDATE admin_users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = OLD.id;
      END;
  `);

  console.log('[db/schema] All tables and indexes ready.');
}

module.exports = { initSchema };
