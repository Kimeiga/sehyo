-- Add custom fields to user table for Better Auth with Drizzle
-- These fields are used by our application and defined in the Drizzle schema

-- Add username field (nullable, unique)
ALTER TABLE user ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON user(username);

-- Add bio field
ALTER TABLE user ADD COLUMN bio TEXT;

-- Add location field
ALTER TABLE user ADD COLUMN location TEXT;

-- Add website field
ALTER TABLE user ADD COLUMN website TEXT;

-- Add cover_image_url field
ALTER TABLE user ADD COLUMN cover_image_url TEXT;

