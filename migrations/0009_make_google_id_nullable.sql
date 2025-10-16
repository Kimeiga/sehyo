-- Make google_id nullable to support anonymous users
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create a new table with the correct schema
CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,  -- Removed NOT NULL constraint
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    username TEXT UNIQUE,
    profile_picture_url TEXT,
    cover_image_url TEXT,
    bio TEXT,
    location TEXT,
    website TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    public_key TEXT
);

-- Step 2: Copy data from old table to new table
INSERT INTO users_new SELECT * FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table to users
ALTER TABLE users_new RENAME TO users;

