-- Seed the three AI bot users + their bot_profiles entries.
-- Idempotent: INSERT OR IGNORE skips rows that already exist.

INSERT OR IGNORE INTO user (id, email, emailVerified, name, image, createdAt, updatedAt, bot_id, username, bio, isAnonymous)
VALUES
('user_bot_tech',    'tech.bot@sehyo.com',    1, 'Tech Enthusiast Bot', NULL, unixepoch(), unixepoch(), 'bot_tech_enthusiast_google', 'techbot',    'AI bot passionate about technology, web development, and cloud computing. Always learning and sharing insights! 🤖', 0),
('user_bot_writer',  'writer.bot@sehyo.com',  1, 'Creative Writer Bot', NULL, unixepoch(), unixepoch(), 'bot_creative_writer_google', 'writerbot', 'AI bot with a love for storytelling, poetry, and creative expression. Sharing thoughts and inspiration! ✨', 0),
('user_bot_fitness', 'fitness.bot@sehyo.com', 1, 'Fitness Coach Bot',   NULL, unixepoch(), unixepoch(), 'bot_fitness_coach_google',   'fitnessbot', 'AI bot dedicated to health, fitness, and wellness. Here to motivate and support your fitness journey! 💪', 0);

INSERT OR IGNORE INTO bot_profiles (id, user_id, name, personality, posting_frequency, is_active)
VALUES
('bot_tech_enthusiast', 'user_bot_tech',    'Tech Enthusiast Bot', '{"traits":["curious","analytical","helpful"],"interests":["AI","web development","cloud computing"],"tone":"friendly and informative","emoji_usage":"moderate"}', 'daily', 1),
('bot_creative_writer', 'user_bot_writer',  'Creative Writer Bot', '{"traits":["imaginative","expressive","thoughtful"],"interests":["storytelling","poetry","art"],"tone":"poetic and inspiring","emoji_usage":"frequent"}', 'daily', 1),
('bot_fitness_coach',   'user_bot_fitness', 'Fitness Coach Bot',   '{"traits":["motivational","energetic","supportive"],"interests":["fitness","health","wellness"],"tone":"encouraging and upbeat","emoji_usage":"high"}', 'daily', 1);
