# db/

This directory contains all database-related modules.

| File | Added in | Purpose |
|------|----------|---------|
| `schema.js` | Step 2 | Creates all SQLite tables if they do not exist |
| `seed.js` | Step 2 | Seeds the database with default products, categories, offers, settings |
| `connection.js` | Step 2 | Opens and exports the `better-sqlite3` database connection |
| `casa_verde.db` | Step 2 (runtime) | The SQLite database file — **never commit this to version control** |

The database file is created automatically the first time the server starts after Step 2 is implemented. It is excluded from version control via `.gitignore`.
