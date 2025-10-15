-- Add public_key column to users table for E2E encryption
ALTER TABLE users ADD COLUMN public_key TEXT;

-- Create messages table with E2E encryption support
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    cipher_text TEXT NOT NULL,  -- Encrypted message content
    aes_key TEXT NOT NULL,       -- Encrypted AES key (encrypted with recipient's public key)
    iv TEXT NOT NULL,            -- Initialization vector for AES encryption
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    read_at INTEGER,             -- Timestamp when message was read
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for faster message queries
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, recipient_id, created_at DESC);

