-- One answer per user per daily prompt. Existing data has at most one
-- (the seed authors each got a single post per prompt and humans haven't
-- posted yet at scale), so the unique index will succeed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_prompt
    ON posts(user_id, prompt_id)
    WHERE prompt_id IS NOT NULL;
