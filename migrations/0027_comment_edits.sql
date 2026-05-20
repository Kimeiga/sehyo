CREATE TABLE IF NOT EXISTS comment_edits (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    edited_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comment_edits_comment_id ON comment_edits(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_edits_edited_at ON comment_edits(edited_at);
