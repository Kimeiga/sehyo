-- bot_profiles and user_keys still have FK references to the old "users"
-- (plural) table on prod, because the baseline used CREATE TABLE IF NOT
-- EXISTS and the originals were left untouched. Rebuild them.

PRAGMA foreign_keys = OFF;

-- bot_profiles: copy data, drop, recreate with correct FK target.
CREATE TABLE bot_profiles_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    personality TEXT NOT NULL,
    posting_frequency TEXT NOT NULL DEFAULT 'daily',
    last_post_at DATETIME,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
INSERT INTO bot_profiles_new SELECT * FROM bot_profiles;
DROP TABLE bot_profiles;
ALTER TABLE bot_profiles_new RENAME TO bot_profiles;
CREATE INDEX IF NOT EXISTS idx_bot_profiles_active ON bot_profiles(is_active, last_post_at);
CREATE INDEX IF NOT EXISTS idx_bot_profiles_user_id ON bot_profiles(user_id);

-- user_keys: same treatment.
CREATE TABLE user_keys_new (
    user_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
INSERT INTO user_keys_new SELECT * FROM user_keys;
DROP TABLE user_keys;
ALTER TABLE user_keys_new RENAME TO user_keys;

PRAGMA foreign_keys = ON;
