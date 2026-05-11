-- Seed data for local mock backend.
-- Safe to re-run: uses INSERT OR IGNORE.
-- Schema assumed: the consolidated `user` table with corrected FKs (post-migration 0016).

INSERT OR IGNORE INTO user (id, email, name, username, image, sprite_id, emailVerified, createdAt, updatedAt)
VALUES
  ('user_alice',   'alice@example.com',   'Alice',   'alice',   NULL, 1, 1, unixepoch(), unixepoch()),
  ('user_bob',     'bob@example.com',     'Bob',     'bob',     NULL, 2, 1, unixepoch(), unixepoch()),
  ('user_carol',   'carol@example.com',   'Carol',   'carol',   NULL, 3, 1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO posts (id, user_id, content, image_url)
VALUES
  ('post_001', 'user_alice', 'Subway car stuck between Shibuya and Omotesando — packed.',                  NULL),
  ('post_002', 'user_bob',   'Power flicker in Brooklyn around 11:47pm. Anyone else?',                     NULL),
  ('post_003', 'user_carol', 'Cherry blossoms peaking early this year in Ueno Park.',                      NULL),
  ('post_004', 'user_alice', 'Long line outside the new ramen spot in Shimokitazawa, ~40 min wait.',       NULL),
  ('post_005', 'user_bob',   'Smoke visible from BQE going east — not sure where the source is.',         NULL);

INSERT OR IGNORE INTO comments (id, post_id, user_id, parent_comment_id, content)
VALUES
  ('cmt_001', 'post_001', 'user_bob',   NULL, 'Same line — finally moving as of 18:32.'),
  ('cmt_002', 'post_002', 'user_carol', NULL, 'Lights came back here in Park Slope. ~3 min outage.'),
  ('cmt_003', 'post_003', 'user_alice', NULL, 'Confirmed, snapped a pic Saturday morning.');

INSERT OR IGNORE INTO reactions (id, user_id, target_type, target_id, reaction_type)
VALUES
  ('rxn_001', 'user_bob',   'post', 'post_001', 'wow'),
  ('rxn_002', 'user_carol', 'post', 'post_001', 'sad'),
  ('rxn_003', 'user_alice', 'post', 'post_002', 'wow'),
  ('rxn_004', 'user_bob',   'post', 'post_003', 'love');
