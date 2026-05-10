-- Migration: Update bot user emails for sehyo rebrand
-- Old emails were *.bot@portfolio-facebook.ai (placeholder, never used to send mail).
UPDATE users SET email = 'tech.bot@sehyo.com'    WHERE id = 'user_bot_tech';
UPDATE users SET email = 'writer.bot@sehyo.com'  WHERE id = 'user_bot_writer';
UPDATE users SET email = 'fitness.bot@sehyo.com' WHERE id = 'user_bot_fitness';
