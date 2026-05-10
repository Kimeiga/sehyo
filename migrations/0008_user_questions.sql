-- Mark posts as user-asked questions so they can render with the daily-
-- prompt headline treatment in the World section. Default 0 = ordinary
-- post (an answer to a daily prompt OR a free-form thought). 1 = a
-- question someone asked.
ALTER TABLE posts ADD COLUMN is_question INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_is_question ON posts(is_question, created_at DESC) WHERE is_question = 1;
