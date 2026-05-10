-- Remove the UNIQUE constraint on daily_prompts.active_date so multiple
-- prompts can coexist for the same UTC day. SQLite has no "ALTER TABLE
-- DROP CONSTRAINT", so we rebuild the table.
--
-- The `posts.prompt_id` FK references daily_prompts(id), not active_date,
-- and we preserve the id column across the rebuild, so post→prompt links
-- survive intact. PRAGMA foreign_keys = OFF is necessary during the swap
-- because there's a brief window where the original table is dropped
-- before the new one is renamed in its place.

PRAGMA foreign_keys = OFF;

CREATE TABLE daily_prompts_new (
    id TEXT PRIMARY KEY,
    prompt_text TEXT NOT NULL,
    active_date TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO daily_prompts_new (id, prompt_text, active_date, created_at)
SELECT id, prompt_text, active_date, created_at FROM daily_prompts;

DROP TABLE daily_prompts;
ALTER TABLE daily_prompts_new RENAME TO daily_prompts;

CREATE INDEX IF NOT EXISTS idx_daily_prompts_active_date
    ON daily_prompts(active_date DESC);

PRAGMA foreign_keys = ON;
