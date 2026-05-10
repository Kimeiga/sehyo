-- Vertical anchor for the uploaded header image, expressed as a
-- 0..100 percentage (CSS background-position-y). Default 50 = center,
-- which matches the previous hardcoded behavior. Owners can reposition
-- their banner from the profile page so a tall image can be pulled
-- up or down to crop usefully.
ALTER TABLE user ADD COLUMN header_image_position_y INTEGER DEFAULT 50;
