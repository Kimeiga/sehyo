-- Give every seed-author bot a realistic profile photo. We use
-- pravatar.cc with the user.id as the seed so each bot gets a
-- stable, deterministic image. Bot personalities don't change the
-- chosen face — we just need a consistent "real person" photo per
-- handle so the blur-to-unblur engagement loop has something to
-- unblur to.
UPDATE user
SET image = 'https://i.pravatar.cc/200?u=' || id
WHERE bot_id LIKE 'seed_%';
