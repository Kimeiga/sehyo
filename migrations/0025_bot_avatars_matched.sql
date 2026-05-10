-- Match bot avatars to their (gender + ethnicity) instead of using
-- a random pravatar.cc seed that often gives a face that doesn't
-- fit the name. We pick specific pravatar IDs (1..70) by browsing
-- the pravatar gallery and identifying which IDs visually match
-- each bot's intended demographic.
--
-- Limitations: pravatar's pool is heavily European / Latino /
-- Black / South Asian. There's essentially one clearly East Asian
-- face in the catalog (ID 17, an older man). For the six East
-- Asian bots we use the closest available ID — mostly South Asian
-- IDs that share dark hair / non-European features. If a better
-- ethnicity-filtered free service becomes available later, swap
-- the East Asian bots to that.

-- European / Anglo
UPDATE user SET image = 'https://i.pravatar.cc/300?img=8'  WHERE id = 'user_seed_dan';      -- Daniel Whitlock (Anglo M)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=13' WHERE id = 'user_seed_jules';    -- Thomas Bramley (English M)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=27' WHERE id = 'user_seed_sam';      -- Anna Bramwell (English F)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=14' WHERE id = 'user_seed_kenji';    -- Lars Lindqvist (Scandinavian M)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=26' WHERE id = 'user_seed_iris';     -- Niamh Murphy (Irish F)

-- French
UPDATE user SET image = 'https://i.pravatar.cc/300?img=28' WHERE id = 'user_seed_lena';     -- Camille Beaufort (French F)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=32' WHERE id = 'user_seed_sasha';    -- Elise Laurent (French F)

-- Mediterranean
UPDATE user SET image = 'https://i.pravatar.cc/300?img=12' WHERE id = 'user_seed_theo';     -- Niko Papadakis (Greek M)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=53' WHERE id = 'user_seed_noor';     -- Marco Conti (Italian M)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=47' WHERE id = 'user_seed_rin';      -- Yael Mizrahi (Mizrahi F)

-- Latin
UPDATE user SET image = 'https://i.pravatar.cc/300?img=44' WHERE id = 'user_seed_mira';     -- Sofia Velazquez (Latina F)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=70' WHERE id = 'user_seed_alex';     -- Diego Mendoza (Latino M)

-- East / South Asian (closest available — pravatar pool is thin here)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=17' WHERE id = 'user_seed_hiroshi';  -- Hiroshi Tanaka (Japanese M, older — only clearly East Asian face)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=59' WHERE id = 'user_seed_minjun';   -- Min-jun Park (Korean M — South Asian closest)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=49' WHERE id = 'user_seed_yuki';     -- Yuki Sato (Japanese F — South Asian closest)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=42' WHERE id = 'user_seed_mei';      -- Mei Chen (Chinese F — South Asian closest)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=18' WHERE id = 'user_seed_akira';    -- Akira Yamamoto (Japanese M — closest)
UPDATE user SET image = 'https://i.pravatar.cc/300?img=16' WHERE id = 'user_seed_jihye';    -- Ji-hye Kim (Korean F — closest)
