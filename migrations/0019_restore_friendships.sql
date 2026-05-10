-- Migration 0016 inadvertently changed the friendships column names from
-- requester_id/addressee_id to user_id/friend_id and the status enum from
-- 'rejected' to 'blocked'. The app code still uses the original schema, so
-- this migration restores it (with the correct FK pointing at user(id)).
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS friendships;
CREATE TABLE friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (requester_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (addressee_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(requester_id, addressee_id)
);
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);
PRAGMA foreign_keys = ON;
