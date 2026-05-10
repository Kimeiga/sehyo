-- Add sprite_id column to user table for sprite selection feature
-- sprite_id will be a number from 1 to 125 corresponding to sprite filenames

ALTER TABLE user ADD COLUMN sprite_id INTEGER;

-- Set a random sprite_id for existing users (1-125)
-- This ensures all existing users get a sprite assigned
UPDATE user 
SET sprite_id = (ABS(RANDOM()) % 125) + 1
WHERE sprite_id IS NULL;

