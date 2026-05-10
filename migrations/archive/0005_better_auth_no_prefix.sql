-- Better Auth Migration (No Prefix)
-- Create Better Auth tables without prefix for compatibility

-- Create user table (Better Auth default name)
CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);

-- Create session table (Better Auth default name)
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
CREATE INDEX IF NOT EXISTS idx_session_expiresAt ON session(expiresAt);

-- Create account table (Better Auth default name)
CREATE TABLE IF NOT EXISTS account (
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
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(providerId, accountId)
);

CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);

-- Create verification table (Better Auth default name)
CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);

-- Migrate data from better_auth_* tables to non-prefixed tables
INSERT OR IGNORE INTO user (id, email, emailVerified, name, image, createdAt, updatedAt)
SELECT id, email, emailVerified, name, image, createdAt, updatedAt
FROM better_auth_user;

INSERT OR IGNORE INTO account (id, userId, accountId, providerId, accessToken, refreshToken, idToken, expiresAt, password, createdAt, updatedAt)
SELECT id, userId, accountId, providerId, accessToken, refreshToken, idToken, expiresAt, password, createdAt, updatedAt
FROM better_auth_account;

