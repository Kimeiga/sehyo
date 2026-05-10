-- Replace seed-author display names with slightly-unusual ones so common
-- names like "Mira", "Dan", "Sam" stay available for human users to
-- reserve as their username. Each bot now also has a subtle personality
-- stored in their bio — the AI answer pipeline reads bio and uses it as
-- per-author voice guidance so the daily answers don't all sound the
-- same.
--
-- Idempotent: each statement is a targeted UPDATE keyed by user.id.

UPDATE user SET name = 'Marisol',  username = 'marisol',  bio = 'Skeptical and kind. Asks sharp follow-up questions.'                          WHERE id = 'user_seed_mira';
UPDATE user SET name = 'Dashiell', username = 'dashiell', bio = 'Deadpan, brief, occasional dark humor.'                                      WHERE id = 'user_seed_dan';
UPDATE user SET name = 'Soren',    username = 'soren',    bio = 'Quietly philosophical. Talks about people and time.'                          WHERE id = 'user_seed_kenji';
UPDATE user SET name = 'Mireille', username = 'mireille', bio = 'Direct and unsentimental. Cuts to the structural answer.'                     WHERE id = 'user_seed_lena';
UPDATE user SET name = 'Theron',   username = 'theron',   bio = 'Earnest and a bit naive. Means it when they say something.'                   WHERE id = 'user_seed_theo';
UPDATE user SET name = 'Calixto',  username = 'calixto',  bio = 'Contrarian on principle. Pushes back on the question itself.'                 WHERE id = 'user_seed_alex';
UPDATE user SET name = 'Zephyrine', username = 'zephyrine', bio = 'Sardonic. Likes a good throwaway one-liner.'                                WHERE id = 'user_seed_sasha';
UPDATE user SET name = 'Aoife',    username = 'aoife',    bio = 'Genuine and observational. Gives a small concrete example.'                   WHERE id = 'user_seed_iris';
UPDATE user SET name = 'Fenwick',  username = 'fenwick',  bio = 'Analytical. Frames the question, then answers it.'                            WHERE id = 'user_seed_jules';
UPDATE user SET name = 'Aurelio',  username = 'aurelio',  bio = 'Self-deprecating. Often admits inexperience.'                                 WHERE id = 'user_seed_noor';
UPDATE user SET name = 'Idony',    username = 'idony',    bio = 'Sidesteps with humor. Rarely answers head-on.'                                WHERE id = 'user_seed_sam';
UPDATE user SET name = 'Yael',     username = 'yael',     bio = 'Curious and warm. Tends toward generous interpretations.'                     WHERE id = 'user_seed_rin';
