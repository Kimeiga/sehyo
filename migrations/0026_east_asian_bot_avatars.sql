-- Replace pravatar.cc-pulled stand-ins for the East Asian bots with
-- AI-generated photos from generated.photos (Asian-race faces).
-- These are AI-generated (no real-people likeness concerns) and the
-- images.generated.photos CDN serves them at stable, public URLs.
--
-- Picked by browsing generated.photos/faces/asian-race via
-- chrome-devtools MCP and visually matching each bot's name to the
-- closest Korean / Japanese / Chinese-coded face in the gallery.

-- Korean
UPDATE user SET image = 'https://images.generated.photos/DH91pRjgAgxNzXlO7f-63lfmMqY1i7Qm6diu8uLptgg/rs:fit:256:256/czM6Ly9pY29uczgu/Z3Bob3Rvcy1wcm9k/LnBob3Rvcy92M18w/MzYzNDIxLmpwZw.jpg'   WHERE id = 'user_seed_minjun';   -- Min-jun Park
UPDATE user SET image = 'https://images.generated.photos/ZjwHNRgDGqfnvx6OGkgmAoOoU-HzCDTlcJbL8EfmNpw/rs:fit:256:256/czM6Ly9pY29uczgu/Z3Bob3Rvcy1wcm9k/LnBob3Rvcy92M18w/NjU4MDEwLmpwZw.jpg'    WHERE id = 'user_seed_jihye';    -- Ji-hye Kim

-- Japanese
UPDATE user SET image = 'https://images.generated.photos/ht2G3IM7WWhe5vxIkAFu1jRk-nuT6lrx_lm43BPYyvo/rs:fit:256:256/czM6Ly9pY29uczgu/Z3Bob3Rvcy1wcm9k/LnBob3Rvcy92M18w/NzIyMjY4LmpwZw.jpg'    WHERE id = 'user_seed_hiroshi';  -- Hiroshi Tanaka
UPDATE user SET image = 'https://images.generated.photos/CqmbC7kW_nVVCr-wQNLcDY1bOjI_mXUZrUYoybHKx_M/rs:fit:256:256/czM6Ly9pY29uczgu/Z3Bob3Rvcy1wcm9k/LnBob3Rvcy92M18w/NTY2NDA5LmpwZw.jpg'    WHERE id = 'user_seed_akira';    -- Akira Yamamoto
UPDATE user SET image = 'https://images.generated.photos/bMwY_2iVlFUxEKHNCzTBiPhmsjfDjtxLKCMwTtjA6PM/rs:fit:256:256/czM6Ly9pY29uczgu/Z3Bob3Rvcy1wcm9k/LnBob3Rvcy92M18w/MjA5NjgzLmpwZw.jpg'    WHERE id = 'user_seed_yuki';     -- Yuki Sato

-- Chinese
UPDATE user SET image = 'https://images.generated.photos/hsA3TWTHRNXkGB0QzWzAQizRVmSKfynCsxGT2eXAr6M/rs:fit:256:256/czM6Ly9pY29uczgu/Z3Bob3Rvcy1wcm9k/LnBob3Rvcy92M18w/Nzc0MTAyLmpwZw.jpg'    WHERE id = 'user_seed_mei';      -- Mei Chen
