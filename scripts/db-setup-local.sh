#!/usr/bin/env bash
# Apply migrations + seed to the local D1 SQLite shim used by the dev mock backend.
# Uses the `sqlite3` CLI directly because wrangler's `d1 execute --file` runs each
# statement on a fresh connection and drops session-level PRAGMAs (e.g. PRAGMA
# foreign_keys = OFF), which migration 0016 depends on.
# Safe to re-run; migrations use IF NOT EXISTS where possible and the seed uses INSERT OR IGNORE.

set -e

DB_NAME="sehyo-db"
MIGRATIONS_DIR="./migrations"
SEED_FILE="./scripts/seed.sql"

cd "$(dirname "$0")/.."

# Ensure the local D1 SQLite file exists; bootstrap it via wrangler if not.
DB_FILE=$(find .wrangler/state/v3/d1 -name "*.sqlite" 2>/dev/null | head -1 || true)
if [ -z "$DB_FILE" ]; then
  echo "Bootstrapping local D1 SQLite file via wrangler…"
  npx wrangler d1 execute "$DB_NAME" --local --command="SELECT 1" >/dev/null 2>&1 || true
  DB_FILE=$(find .wrangler/state/v3/d1 -name "*.sqlite" 2>/dev/null | head -1 || true)
fi

if [ -z "$DB_FILE" ]; then
  echo "Could not locate or create local D1 SQLite file."
  echo "Run 'npx wrangler d1 execute $DB_NAME --local --command=\"SELECT 1\"' once and try again."
  exit 1
fi

echo "Applying migrations to $DB_FILE…"
for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  → $(basename "$file")"
  sqlite3 "$DB_FILE" < "$file" || echo "    (failed — continuing)"
done

if [ -f "$SEED_FILE" ]; then
  echo
  echo "Seeding with fake data ($SEED_FILE)…"
  sqlite3 "$DB_FILE" < "$SEED_FILE"
fi

echo
echo "Done. Run 'npm run dev' to start with the local mock backend."
