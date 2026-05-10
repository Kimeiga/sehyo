-- Migration 0013: Migrate from google_id to bot_id
-- This removes the confusing google_id field and adds a proper bot_id field

-- Step 1: Add bot_id field (without UNIQUE constraint initially)
ALTER TABLE user ADD COLUMN bot_id TEXT;

-- Step 2: Migrate bot users (those with google_id starting with 'bot_')
UPDATE user
SET bot_id = google_id
WHERE google_id LIKE 'bot_%';

-- Step 3: Create unique index on bot_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bot_id ON user(bot_id) WHERE bot_id IS NOT NULL;

-- Step 4: Clear google_id for bot users (they now use bot_id)
UPDATE user
SET google_id = NULL
WHERE google_id LIKE 'bot_%';

-- Step 5: Clear google_id for test users (they don't need it)
UPDATE user
SET google_id = NULL
WHERE google_id LIKE 'test_%';

-- Step 6: Clear google_id for old anonymous users (they don't need it)
UPDATE user
SET google_id = NULL
WHERE google_id LIKE 'anon_%';

-- Note: We'll drop the google_id column in a separate migration after verifying everything works
-- For now, we keep it as a safety measure

