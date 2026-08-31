# Casa Verde — كازا فيردي

Fast food restaurant website for **Casa Verde, Berriane, Algeria**.

Bilingual Arabic/French — RTL/LTR — WhatsApp ordering — Admin dashboard.

---

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env — set JWT_SECRET to a long random string (see below)

# 3. Start the server
npm start
# → http://localhost:3000        customer site
# → http://localhost:3000/admin  admin panel
```

### Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Paste the output as `JWT_SECRET` in `.env`.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | Set to `production` on server |
| `JWT_SECRET` | **Yes in production** | dev fallback | Signs admin JWT tokens |
| `DB_PATH` | No | `./db/casa_verde.db` | SQLite file location |
| `ALLOWED_ORIGIN` | No | `*` | CORS origin whitelist |
| `ADMIN_USERNAME` | No (first run) | `admin` | Admin login username |
| `ADMIN_PASSWORD` | No (first run) | `casaverde2025` | Admin login password |

> **Important:** `ADMIN_USERNAME` and `ADMIN_PASSWORD` are only read on the **first run** when the `admin_users` table is empty. Change the default password before deploying.

---

## Deploying to Railway / Render

1. Push the repository (without `node_modules/` and `*.db` — both are in `.gitignore`).
2. Set environment variables in the platform dashboard:
   - `JWT_SECRET` — a 64-character random hex string
   - `NODE_ENV=production`
   - `ADMIN_PASSWORD` — a strong password (only needed on first deploy)
   - `DB_PATH` — path on the persistent volume, e.g. `/data/casa_verde.db`
3. Add a **persistent volume** mounted at `/data` (Railway) or equivalent.
4. Build command: `npm install`
5. Start command: `npm start`

The database is created automatically on first start. Subsequent restarts skip seeding.

---

## Admin panel

Visit `/admin`. A login screen appears. Default credentials:

- **Username:** `admin`
- **Password:** `casaverde2025` ← **change this before going live**

The admin panel currently supports read-only dashboard views. Product/category/offer CRUD APIs are implemented on the backend and will be wired to the UI in a future update.

---

## What is intentionally NOT implemented

- **Order persistence** — customer orders go via WhatsApp only. No database storage.
- **Admin CRUD UI** — backend CRUD APIs exist; admin.html dashboard UI wiring is postponed.
- **Admin settings sync** — settings changes in admin.html are localStorage-only for now.
- **Real-time order notifications** — not needed; WhatsApp handles dispatch.

---

## Architecture

```
public/
  index.html      Customer website (AR/FR, cart, checkout → WhatsApp)
  admin.html      Admin dashboard (JWT-protected login)
routes/
  auth.js         POST /api/auth/login, GET /api/auth/verify
  products.js     GET (public) + POST/PUT/DELETE (admin JWT)
  categories.js   GET (public) + POST/PUT/DELETE/PATCH (admin JWT)
  offers.js       GET (public) + POST/PUT/DELETE/PATCH (admin JWT)
  settings.js     GET /api/settings/public (public) + admin stubs
  orders.js       Intentionally stub — WhatsApp-only ordering
  middleware/
    auth.js       requireAuth JWT middleware + signToken
db/
  connection.js   better-sqlite3 singleton with WAL mode
  schema.js       7 tables, 7 indexes, 5 triggers
  seed.js         Default data (23 products, 6 categories, 4 offers)
server.js         Express entry point
```

---

## Technology

- **Runtime:** Node.js ≥ 18
- **Framework:** Express 4
- **Database:** SQLite via `better-sqlite3`
- **Auth:** JWT (jsonwebtoken) + bcrypt (bcryptjs)
- **Rate limiting:** express-rate-limit (login endpoint)
