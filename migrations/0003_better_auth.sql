-- Better Auth Migration
-- This adds Better Auth tables while preserving existing user data

-- Create Better Auth user table (we'll migrate data from existing users table)
CREATE TABLE IF NOT EXISTS better_auth_user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);

CREATE INDEX idx_better_auth_user_email ON better_auth_user(email);

-- Create Better Auth session table (replaces old sessions table)
CREATE TABLE IF NOT EXISTS better_auth_session (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES better_auth_user(id) ON DELETE CASCADE
);

CREATE INDEX idx_better_auth_session_userId ON better_auth_session(userId);
CREATE INDEX idx_better_auth_session_expiresAt ON better_auth_session(expiresAt);

-- Create Better Auth account table (for OAuth providers like Google)
CREATE TABLE IF NOT EXISTS better_auth_account (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    expiresAt INTEGER,
    password TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES better_auth_user(id) ON DELETE CASCADE,
    UNIQUE(providerId, accountId)
);

CREATE INDEX idx_better_auth_account_userId ON better_auth_account(userId);

-- Create Better Auth verification table (for email verification, password reset)
CREATE TABLE IF NOT EXISTS better_auth_verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);

CREATE INDEX idx_better_auth_verification_identifier ON better_auth_verification(identifier);

-- Migrate existing users to Better Auth format
INSERT INTO better_auth_user (id, email, emailVerified, name, image, createdAt, updatedAt)
SELECT 
    id,
    email,
    1, -- Mark existing users as verified
    display_name,
    profile_picture_url,
    created_at,
    COALESCE(updated_at, created_at)
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM better_auth_user WHERE better_auth_user.id = users.id
);

-- Migrate Google OAuth accounts
INSERT INTO better_auth_account (id, userId, accountId, providerId, accessToken, refreshToken, idToken, expiresAt, password, createdAt, updatedAt)
SELECT 
    lower(hex(randomblob(16))), -- Generate random ID
    id,
    google_id,
    'google',
    NULL, -- We don't store access tokens
    NULL,
    NULL,
    NULL,
    NULL,
    created_at,
    COALESCE(updated_at, created_at)
FROM users
WHERE google_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM better_auth_account 
    WHERE better_auth_account.userId = users.id 
    AND better_auth_account.providerId = 'google'
);

-- Drop old sessions table (Better Auth will manage sessions)
DROP TABLE IF EXISTS sessions;

