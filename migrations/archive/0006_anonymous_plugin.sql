-- Add isAnonymous field for Better Auth anonymous plugin
-- This field indicates whether a user is an anonymous guest user

ALTER TABLE user ADD COLUMN isAnonymous INTEGER DEFAULT 0;

