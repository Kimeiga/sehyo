-- Fix foreign key constraints to reference 'user' table instead of 'users'
-- SQLite doesn't support ALTER TABLE to modify foreign keys, so we need to recreate tables

-- Disable foreign key checks temporarily
PRAGMA foreign_keys = OFF;

-- Step 1: Drop old posts table
DROP TABLE IF EXISTS posts;

-- Step 2: Create new posts table with correct foreign key
CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Step 3: Recreate indexes
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Step 4: Drop old comments table
DROP TABLE IF EXISTS comments;

-- Step 5: Create new comments table with correct foreign key
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_comment_id TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Step 6: Recreate indexes
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);

-- Step 7: Drop old reactions table
DROP TABLE IF EXISTS reactions;

-- Step 8: Create new reactions table with correct foreign key
CREATE TABLE reactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('post', 'comment')),
    target_id TEXT NOT NULL,
    reaction_type TEXT NOT NULL CHECK(reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(user_id, target_type, target_id)
);

-- Step 9: Recreate indexes
CREATE INDEX idx_reactions_user_id ON reactions(user_id);
CREATE INDEX idx_reactions_target ON reactions(target_type, target_id);

-- Step 10: Drop old friendships table
DROP TABLE IF EXISTS friendships;

-- Step 11: Create new friendships table with correct foreign key
CREATE TABLE friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'blocked')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(user_id, friend_id)
);

-- Step 12: Recreate indexes
CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX idx_friendships_status ON friendships(status);

-- Step 13: Drop old messages table
DROP TABLE IF EXISTS messages;

-- Step 14: Create new messages table with correct foreign key
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    encrypted_content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    read_at INTEGER,
    FOREIGN KEY (sender_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Step 15: Recreate indexes
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;

