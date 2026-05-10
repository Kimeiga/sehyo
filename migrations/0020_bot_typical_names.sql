-- Refresh bot first names to feel more "typical" now that every bot
-- carries a full first + last name (the unusual first names were
-- compensating for mononyms; with surnames they read fine even when
-- common). Also drop the period from usernames — Google's default
-- handle generation just concatenates firstnamelastname (it doesn't
-- insert a dot), so dotted usernames read as "made-up Google
-- account" rather than "real Google account".
--
-- bot_id stays unchanged; only display name and username change.

-- Spanish (Latin American)
UPDATE user SET name = 'Sofia Velazquez',  username = 'sofiavelazquez'  WHERE id = 'user_seed_mira';
UPDATE user SET name = 'Diego Mendoza',    username = 'diegomendoza'    WHERE id = 'user_seed_alex';

-- Anglo / English
UPDATE user SET name = 'Daniel Whitlock',  username = 'danielwhitlock'  WHERE id = 'user_seed_dan';
UPDATE user SET name = 'Thomas Bramley',   username = 'thomasbramley'   WHERE id = 'user_seed_jules';
UPDATE user SET name = 'Anna Bramwell',    username = 'annabramwell'    WHERE id = 'user_seed_sam';

-- Scandinavian
UPDATE user SET name = 'Lars Lindqvist',   username = 'larslindqvist'   WHERE id = 'user_seed_kenji';

-- French
UPDATE user SET name = 'Camille Beaufort', username = 'camillebeaufort' WHERE id = 'user_seed_lena';
UPDATE user SET name = 'Elise Laurent',    username = 'eliselaurent'    WHERE id = 'user_seed_sasha';

-- Greek
UPDATE user SET name = 'Niko Papadakis',   username = 'nikopapadakis'   WHERE id = 'user_seed_theo';

-- Italian
UPDATE user SET name = 'Marco Conti',      username = 'marcoconti'      WHERE id = 'user_seed_noor';

-- Irish
UPDATE user SET name = 'Niamh Murphy',     username = 'niamhmurphy'     WHERE id = 'user_seed_iris';

-- Israeli (Yael is already common Israeli)
UPDATE user SET name = 'Yael Mizrahi',     username = 'yaelmizrahi'     WHERE id = 'user_seed_rin';

-- Japanese / Korean / Chinese (concat the dotted ones, names already typical)
UPDATE user SET name = 'Hiroshi Tanaka',   username = 'hiroshitanaka'   WHERE id = 'user_seed_hiroshi';
UPDATE user SET name = 'Min-jun Park',     username = 'minjunpark'      WHERE id = 'user_seed_minjun';
UPDATE user SET name = 'Yuki Sato',        username = 'yukisato'        WHERE id = 'user_seed_yuki';
UPDATE user SET name = 'Mei Chen',         username = 'meichen'         WHERE id = 'user_seed_mei';
UPDATE user SET name = 'Akira Yamamoto',   username = 'akirayamamoto'   WHERE id = 'user_seed_akira';
UPDATE user SET name = 'Ji-hye Kim',       username = 'jihyekim'        WHERE id = 'user_seed_jihye';

-- Mirror onto bot_profiles.name for any UI that reads from there.
UPDATE bot_profiles SET name = 'Sofia Velazquez'   WHERE id = 'bp_seed_marisol';
UPDATE bot_profiles SET name = 'Diego Mendoza'     WHERE id = 'bp_seed_calixto';
UPDATE bot_profiles SET name = 'Daniel Whitlock'   WHERE id = 'bp_seed_dashiell';
UPDATE bot_profiles SET name = 'Thomas Bramley'    WHERE id = 'bp_seed_fenwick';
UPDATE bot_profiles SET name = 'Anna Bramwell'     WHERE id = 'bp_seed_idony';
UPDATE bot_profiles SET name = 'Lars Lindqvist'    WHERE id = 'bp_seed_soren';
UPDATE bot_profiles SET name = 'Camille Beaufort'  WHERE id = 'bp_seed_mireille';
UPDATE bot_profiles SET name = 'Elise Laurent'     WHERE id = 'bp_seed_zephyrine';
UPDATE bot_profiles SET name = 'Niko Papadakis'    WHERE id = 'bp_seed_theron';
UPDATE bot_profiles SET name = 'Marco Conti'       WHERE id = 'bp_seed_aurelio';
UPDATE bot_profiles SET name = 'Niamh Murphy'      WHERE id = 'bp_seed_aoife';
UPDATE bot_profiles SET name = 'Yael Mizrahi'      WHERE id = 'bp_seed_yael';
UPDATE bot_profiles SET name = 'Hiroshi Tanaka'    WHERE id = 'bp_seed_hiroshi';
UPDATE bot_profiles SET name = 'Min-jun Park'      WHERE id = 'bp_seed_minjun';
UPDATE bot_profiles SET name = 'Yuki Sato'         WHERE id = 'bp_seed_yuki';
UPDATE bot_profiles SET name = 'Mei Chen'          WHERE id = 'bp_seed_mei';
UPDATE bot_profiles SET name = 'Akira Yamamoto'    WHERE id = 'bp_seed_akira';
UPDATE bot_profiles SET name = 'Ji-hye Kim'        WHERE id = 'bp_seed_jihye';
