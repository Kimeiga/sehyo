-- Replace the philosopher bot personas with a pool of "seed authors":
-- realistic-sounding fake users that the daily AI pipeline attributes
-- generated answers to. We keep the philosopher rows so historical posts
-- still resolve their author, but mark them inactive so no new posts are
-- attributed to them.
--
-- Seed author bot_id is prefixed `seed_*` so the AI pipeline can scope
-- the random pool to just these (and the old `bot_*` philosopher ids
-- are not picked up).

-- 1. Deactivate philosopher bots; their old posts remain authored by them.
UPDATE bot_profiles SET is_active = 0;

-- 2. Insert a pool of realistic-sounding seed-author user rows. Names mix
-- cultural backgrounds and skew gender-neutral or short. Email is a
-- placeholder (never receives mail). isAnonymous = 0 because they
-- "are" people from the reader's POV.
INSERT OR IGNORE INTO user (id, email, emailVerified, name, image, createdAt, updatedAt, bot_id, username, bio, isAnonymous)
VALUES
('user_seed_mira',  'mira@sehyo.com',  1, 'Mira',  NULL, unixepoch(), unixepoch(), 'seed_mira',  'mira',  NULL, 0),
('user_seed_dan',   'dan@sehyo.com',   1, 'Dan',   NULL, unixepoch(), unixepoch(), 'seed_dan',   'dan',   NULL, 0),
('user_seed_kenji', 'kenji@sehyo.com', 1, 'Kenji', NULL, unixepoch(), unixepoch(), 'seed_kenji', 'kenji', NULL, 0),
('user_seed_lena',  'lena@sehyo.com',  1, 'Lena',  NULL, unixepoch(), unixepoch(), 'seed_lena',  'lena',  NULL, 0),
('user_seed_theo',  'theo@sehyo.com',  1, 'Theo',  NULL, unixepoch(), unixepoch(), 'seed_theo',  'theo',  NULL, 0),
('user_seed_alex',  'alex@sehyo.com',  1, 'Alex',  NULL, unixepoch(), unixepoch(), 'seed_alex',  'alex',  NULL, 0),
('user_seed_sasha', 'sasha@sehyo.com', 1, 'Sasha', NULL, unixepoch(), unixepoch(), 'seed_sasha', 'sasha', NULL, 0),
('user_seed_iris',  'iris@sehyo.com',  1, 'Iris',  NULL, unixepoch(), unixepoch(), 'seed_iris',  'iris',  NULL, 0),
('user_seed_jules', 'jules@sehyo.com', 1, 'Jules', NULL, unixepoch(), unixepoch(), 'seed_jules', 'jules', NULL, 0),
('user_seed_noor',  'noor@sehyo.com',  1, 'Noor',  NULL, unixepoch(), unixepoch(), 'seed_noor',  'noor',  NULL, 0),
('user_seed_sam',   'sam@sehyo.com',   1, 'Sam',   NULL, unixepoch(), unixepoch(), 'seed_sam',   'sam',   NULL, 0),
('user_seed_rin',   'rin@sehyo.com',   1, 'Rin',   NULL, unixepoch(), unixepoch(), 'seed_rin',   'rin',   NULL, 0);
