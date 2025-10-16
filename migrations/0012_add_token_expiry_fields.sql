-- Migration 0012: Add accessTokenExpiresAt, refreshTokenExpiresAt, and scope to account table
-- This fixes the "accessTokenExpiresAt does not exist" error from Better Auth

-- Add new fields to account table
ALTER TABLE account ADD COLUMN accessTokenExpiresAt INTEGER;
ALTER TABLE account ADD COLUMN refreshTokenExpiresAt INTEGER;
ALTER TABLE account ADD COLUMN scope TEXT;

-- Drop the old expiresAt column if it exists (it's been replaced by accessTokenExpiresAt)
-- Note: SQLite doesn't support DROP COLUMN directly, so we'll leave it for now
-- It won't cause issues and can be cleaned up later if needed

