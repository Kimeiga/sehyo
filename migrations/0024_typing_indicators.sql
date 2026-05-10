-- Lightweight per-conversation typing indicators. We store one row
-- per (sender, recipient) pair and update it via UPSERT every couple
-- of seconds while the user is typing. Reading just checks whether
-- last_typed_at is within the last few seconds — no scheduled
-- cleanup needed since stale rows are simply ignored at read time.
CREATE TABLE IF NOT EXISTS typing_indicators (
    user_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    last_typed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_typing_recipient ON typing_indicators(recipient_id, last_typed_at);
