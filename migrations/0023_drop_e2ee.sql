-- Drop end-to-end encryption from the messaging stack.
--
-- The previous design encrypted each message with the recipient's
-- public key (and later, after a follow-up patch, with the sender's
-- public key as a second copy). It was fragile in practice — any
-- /messages visit from a browser without local keys triggered
-- generate-keys, which silently overwrote the user's server-side
-- public_key, breaking decryption of every message that had been
-- sealed with the previous one. The result was conversations going
-- silently undecryptable across devices, sessions, and cleared
-- caches, with no recovery path.
--
-- For a daily-question social app the threat model doesn't justify
-- that complexity. Storing message content in plaintext is the same
-- model every other social platform uses for non-sensitive DMs and
-- it just works.
--
-- Strategy: rebuild the messages table around a single `content`
-- column. Existing rows are unrecoverable (their plaintext lives
-- only in cipher form, encrypted to keys we can't reconstruct), so
-- we drop them and start fresh.

DROP TABLE IF EXISTS messages;

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    read_at INTEGER,
    FOREIGN KEY (sender_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_recipient ON messages(recipient_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX idx_messages_conversation ON messages(sender_id, recipient_id, created_at DESC);
