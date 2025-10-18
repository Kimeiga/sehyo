-- Migration 0014: Add Full-Text Search (FTS5) for global search
-- This enables fast, ranked search across users, posts, and comments

-- Drop existing FTS tables if they exist
DROP TABLE IF EXISTS user_fts;
DROP TABLE IF EXISTS post_fts;
DROP TABLE IF EXISTS comment_fts;

-- Create FTS5 virtual table for users
CREATE VIRTUAL TABLE user_fts USING fts5(
    user_id UNINDEXED,
    display_name,
    username,
    bio
);

-- Create FTS5 virtual table for posts
CREATE VIRTUAL TABLE post_fts USING fts5(
    post_id UNINDEXED,
    content,
    user_display_name
);

-- Create FTS5 virtual table for comments
CREATE VIRTUAL TABLE comment_fts USING fts5(
    comment_id UNINDEXED,
    content,
    user_display_name
);

-- Populate user_fts with existing data
INSERT INTO user_fts(user_id, display_name, username, bio)
SELECT id, name, username, bio
FROM user
WHERE name IS NOT NULL;

-- Populate post_fts with existing data
INSERT INTO post_fts(post_id, content, user_display_name)
SELECT p.id, p.content, u.name
FROM posts p
JOIN user u ON p.user_id = u.id
WHERE p.content IS NOT NULL;

-- Populate comment_fts with existing data
INSERT INTO comment_fts(comment_id, content, user_display_name)
SELECT c.id, c.content, u.name
FROM comments c
JOIN user u ON c.user_id = u.id
WHERE c.content IS NOT NULL;

-- Triggers to keep FTS tables in sync with main tables

-- User triggers
CREATE TRIGGER IF NOT EXISTS user_fts_insert AFTER INSERT ON user BEGIN
    INSERT INTO user_fts(user_id, display_name, username, bio)
    VALUES (new.id, new.name, new.username, new.bio);
END;

CREATE TRIGGER IF NOT EXISTS user_fts_update AFTER UPDATE ON user BEGIN
    UPDATE user_fts SET
        display_name = new.name,
        username = new.username,
        bio = new.bio
    WHERE user_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS user_fts_delete AFTER DELETE ON user BEGIN
    DELETE FROM user_fts WHERE user_id = old.id;
END;

-- Post triggers
CREATE TRIGGER IF NOT EXISTS post_fts_insert AFTER INSERT ON posts BEGIN
    INSERT INTO post_fts(post_id, content, user_display_name)
    SELECT new.id, new.content, u.name
    FROM user u WHERE u.id = new.user_id;
END;

CREATE TRIGGER IF NOT EXISTS post_fts_update AFTER UPDATE ON posts BEGIN
    UPDATE post_fts SET
        content = new.content
    WHERE post_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS post_fts_delete AFTER DELETE ON posts BEGIN
    DELETE FROM post_fts WHERE post_id = old.id;
END;

-- Comment triggers
CREATE TRIGGER IF NOT EXISTS comment_fts_insert AFTER INSERT ON comments BEGIN
    INSERT INTO comment_fts(comment_id, content, user_display_name)
    SELECT new.id, new.content, u.name
    FROM user u WHERE u.id = new.user_id;
END;

CREATE TRIGGER IF NOT EXISTS comment_fts_update AFTER UPDATE ON comments BEGIN
    UPDATE comment_fts SET
        content = new.content
    WHERE comment_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS comment_fts_delete AFTER DELETE ON comments BEGIN
    DELETE FROM comment_fts WHERE comment_id = old.id;
END;

