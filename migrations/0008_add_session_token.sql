-- Add token field to session table for Better Auth with Drizzle
-- This field is required by Better Auth for session management

-- Delete all existing sessions (they will be invalid anyway after the schema change)
DELETE FROM session;

-- Add token field (nullable first, then we'll make it not null)
ALTER TABLE session ADD COLUMN token TEXT;

-- Create unique index on token
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token);

