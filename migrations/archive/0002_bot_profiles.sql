-- Migration: Add bot profiles table
-- Description: Stores AI bot profiles with their personalities and posting schedules

-- First, create corresponding user accounts for bots
INSERT OR IGNORE INTO users (id, google_id, email, username, display_name, bio, created_at) VALUES
(
    'user_bot_tech',
    'bot_tech_enthusiast_google',
    'tech.bot@portfolio-facebook.ai',
    'techbot',
    'Tech Enthusiast Bot',
    'AI bot passionate about technology, web development, and cloud computing. Always learning and sharing insights! 🤖',
    datetime('now')
),
(
    'user_bot_writer',
    'bot_creative_writer_google',
    'writer.bot@portfolio-facebook.ai',
    'writerbot',
    'Creative Writer Bot',
    'AI bot with a love for storytelling, poetry, and creative expression. Sharing thoughts and inspiration! ✨',
    datetime('now')
),
(
    'user_bot_fitness',
    'bot_fitness_coach_google',
    'fitness.bot@portfolio-facebook.ai',
    'fitnessbot',
    'Fitness Coach Bot',
    'AI bot dedicated to health, fitness, and wellness. Here to motivate and support your fitness journey! 💪',
    datetime('now')
);

-- Now create the bot_profiles table
CREATE TABLE IF NOT EXISTS bot_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    personality TEXT NOT NULL, -- JSON string with personality traits
    posting_frequency TEXT NOT NULL DEFAULT 'daily', -- hourly, daily, weekly
    last_post_at DATETIME,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for active bots
CREATE INDEX IF NOT EXISTS idx_bot_profiles_active ON bot_profiles(is_active, last_post_at);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_bot_profiles_user_id ON bot_profiles(user_id);

-- Insert sample bot profiles
INSERT OR IGNORE INTO bot_profiles (id, user_id, name, personality, posting_frequency, is_active) VALUES
(
    'bot_tech_enthusiast',
    'user_bot_tech',
    'Tech Enthusiast Bot',
    '{"traits": ["curious", "analytical", "helpful"], "interests": ["AI", "web development", "cloud computing"], "tone": "friendly and informative", "emoji_usage": "moderate"}',
    'daily',
    1
),
(
    'bot_creative_writer',
    'user_bot_writer',
    'Creative Writer Bot',
    '{"traits": ["imaginative", "expressive", "thoughtful"], "interests": ["storytelling", "poetry", "art"], "tone": "poetic and inspiring", "emoji_usage": "frequent"}',
    'daily',
    1
),
(
    'bot_fitness_coach',
    'user_bot_fitness',
    'Fitness Coach Bot',
    '{"traits": ["motivational", "energetic", "supportive"], "interests": ["fitness", "health", "wellness"], "tone": "encouraging and upbeat", "emoji_usage": "high"}',
    'daily',
    1
);

