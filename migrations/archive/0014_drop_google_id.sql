-- Migration 0014: Drop the legacy google_id column
-- This completes the migration to bot_id

-- Verify no users still have google_id set (should all be NULL)
-- If this fails, investigate which users still have google_id and why

-- Drop the unique index first
DROP INDEX IF EXISTS idx_user_google_id;

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Step 1: Create new table without google_id
CREATE TABLE user_new (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    bot_id TEXT UNIQUE,
    username TEXT UNIQUE,
    bio TEXT,
    location TEXT,
    website TEXT,
    cover_image_url TEXT,
    public_key TEXT,
    isAnonymous INTEGER DEFAULT 0
);

-- Step 2: Copy data from old table to new table
INSERT INTO user_new (
    id, email, emailVerified, name, image, createdAt, updatedAt,
    bot_id, username, bio, location, website, cover_image_url, public_key, isAnonymous
)
SELECT 
    id, email, emailVerified, name, image, createdAt, updatedAt,
    bot_id, username, bio, location, website, cover_image_url, public_key, isAnonymous
FROM user;

-- Step 3: Drop old table
DROP TABLE user;

-- Step 4: Rename new table to user
ALTER TABLE user_new RENAME TO user;

-- Step 5: Recreate the bot_id index
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bot_id ON user(bot_id) WHERE bot_id IS NOT NULL;

