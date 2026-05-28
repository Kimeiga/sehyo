-- Masked social layer: personas, thread-local aliases, circles, commitments,
-- and explicit reveal grants. Existing prompt-era tables are left intact so
-- old content can remain readable while the home product moves to social_posts.

CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    accent TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'stable' CHECK(kind IN ('stable', 'ephemeral')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    archived INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id, archived);
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_user_label ON personas(user_id, lower(label)) WHERE archived = 0;

CREATE TABLE IF NOT EXISTS circles (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (owner_user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_circles_owner ON circles(owner_user_id);

CREATE TABLE IF NOT EXISTS circle_members (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'member')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'invited', 'removed')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON circle_members(circle_id, status);

CREATE TABLE IF NOT EXISTS social_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    persona_id TEXT,
    circle_id TEXT,
    kind TEXT NOT NULL DEFAULT 'post' CHECK(kind IN ('post', 'ask', 'offer', 'plan')),
    identity_mode TEXT NOT NULL DEFAULT 'masked' CHECK(identity_mode IN ('masked', 'persona', 'anonymous', 'named')),
    alias_label TEXT NOT NULL,
    alias_accent TEXT NOT NULL,
    title TEXT,
    body TEXT NOT NULL,
    place TEXT,
    happens_at INTEGER,
    threshold INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'met', 'closed', 'cancelled')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL,
    FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_social_posts_feed ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_circle ON social_posts(circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_kind ON social_posts(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS social_thread_aliases (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    accent TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_social_thread_aliases_post ON social_thread_aliases(post_id);

CREATE TABLE IF NOT EXISTS social_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    persona_id TEXT,
    thread_alias_id TEXT,
    identity_mode TEXT NOT NULL DEFAULT 'thread' CHECK(identity_mode IN ('thread', 'persona', 'anonymous', 'named')),
    alias_label TEXT NOT NULL,
    alias_accent TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL,
    FOREIGN KEY (thread_alias_id) REFERENCES social_thread_aliases(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_comments_user ON social_comments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_commitments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'committed' CHECK(status IN ('committed', 'done', 'cancelled')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_social_commitments_post ON social_commitments(post_id, status);
CREATE INDEX IF NOT EXISTS idx_social_commitments_user ON social_commitments(user_id, status);

CREATE TABLE IF NOT EXISTS social_reveals (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    viewer_user_id TEXT NOT NULL,
    persona_id TEXT,
    post_id TEXT,
    comment_id TEXT,
    scope TEXT NOT NULL CHECK(scope IN ('persona', 'post', 'comment')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (owner_user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (viewer_user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES social_comments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_social_reveals_owner ON social_reveals(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_social_reveals_viewer ON social_reveals(viewer_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_reveals_unique_persona
    ON social_reveals(owner_user_id, viewer_user_id, persona_id, scope)
    WHERE scope = 'persona' AND persona_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_reveals_unique_post
    ON social_reveals(owner_user_id, viewer_user_id, post_id, scope)
    WHERE scope = 'post' AND post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_reveals_unique_comment
    ON social_reveals(owner_user_id, viewer_user_id, comment_id, scope)
    WHERE scope = 'comment' AND comment_id IS NOT NULL;
