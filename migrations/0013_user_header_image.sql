-- Optional uploaded header image. NULL = use the deterministic
-- gradient (computed client-side from user.id, no DB column needed).
ALTER TABLE user ADD COLUMN header_image_url TEXT;
