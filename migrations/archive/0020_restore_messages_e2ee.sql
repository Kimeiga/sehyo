-- Migration 0016 dropped the e2ee messages schema (cipher_text/aes_key/iv)
-- and replaced it with a flat encrypted_content column. The app code
-- (api/messages/send, api/messages/[userId]) still uses the e2ee fields,
-- so this migration restores them with the correct FK to user(id).
-- Messages table is empty in prod, so no data preserved.
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS messages;
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    cipher_text TEXT NOT NULL,
    aes_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    read_at INTEGER,
    FOREIGN KEY (sender_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX idx_messages_conversation ON messages(sender_id, recipient_id, created_at DESC);
PRAGMA foreign_keys = ON;
