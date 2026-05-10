-- Phase 1 of the prompt-of-the-day flow.
-- Adds daily_prompts and links posts to a prompt.
-- Idempotent on a DB that already has the prior baseline.

CREATE TABLE IF NOT EXISTS daily_prompts (
    id TEXT PRIMARY KEY,
    prompt_text TEXT NOT NULL,
    active_date TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_daily_prompts_active_date ON daily_prompts(active_date DESC);

-- Add prompt_id to posts (no-op if column already exists; harmless on first run).
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; the wrapper at the workflow level
-- expects this to fail silently on subsequent runs (continue-on-error in CI).
-- For a one-shot remote apply we accept the error and move on if it's a dup.
ALTER TABLE posts ADD COLUMN prompt_id TEXT REFERENCES daily_prompts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_prompt_id ON posts(prompt_id);
