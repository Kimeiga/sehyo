-- Consolidate user and users tables into a single user table
-- This eliminates data duplication and simplifies the schema

-- Step 1: Add missing fields to user table
ALTER TABLE user ADD COLUMN google_id TEXT;
ALTER TABLE user ADD COLUMN public_key TEXT;

-- Step 2: Create unique index on google_id (nullable unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_google_id ON user(google_id) WHERE google_id IS NOT NULL;

-- Step 3: Migrate data from users table to user table
-- Update existing users in the user table with data from users table
UPDATE user
SET 
    google_id = (SELECT google_id FROM users WHERE users.id = user.id),
    public_key = (SELECT public_key FROM users WHERE users.id = user.id),
    username = COALESCE(user.username, (SELECT username FROM users WHERE users.id = user.id)),
    bio = COALESCE(user.bio, (SELECT bio FROM users WHERE users.id = user.id)),
    location = COALESCE(user.location, (SELECT location FROM users WHERE users.id = user.id)),
    website = COALESCE(user.website, (SELECT website FROM users WHERE users.id = user.id)),
    cover_image_url = COALESCE(user.cover_image_url, (SELECT cover_image_url FROM users WHERE users.id = user.id))
WHERE EXISTS (SELECT 1 FROM users WHERE users.id = user.id);

-- Step 4: Insert any users that exist in users table but not in user table
INSERT INTO user (id, email, emailVerified, name, image, createdAt, updatedAt, google_id, username, bio, location, website, cover_image_url, public_key, isAnonymous)
SELECT 
    u.id,
    u.email,
    0 as emailVerified,
    u.display_name as name,
    u.profile_picture_url as image,
    u.created_at as createdAt,
    u.updated_at as updatedAt,
    u.google_id,
    u.username,
    u.bio,
    u.location,
    u.website,
    u.cover_image_url,
    u.public_key,
    CASE WHEN u.google_id IS NULL THEN 1 ELSE 0 END as isAnonymous
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user WHERE user.id = u.id);

-- Step 5: Drop the users table
DROP TABLE users;

