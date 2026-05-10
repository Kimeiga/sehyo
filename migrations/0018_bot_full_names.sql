-- Give every seed bot a realistic FIRST + LAST name so the feed reads
-- like it's full of normal Google-style accounts (rather than the
-- mononym look it had before). Surnames chosen to match the
-- linguistic / cultural register of the first name. Username and
-- bot_id stay unchanged so existing references keep working.

UPDATE user SET name = 'Marisol Velázquez' WHERE id = 'user_seed_mira';
UPDATE user SET name = 'Dashiell Whitlock' WHERE id = 'user_seed_dan';
UPDATE user SET name = 'Soren Lindqvist'   WHERE id = 'user_seed_kenji';
UPDATE user SET name = 'Mireille Beaufort' WHERE id = 'user_seed_lena';
UPDATE user SET name = 'Theron Papadakis'  WHERE id = 'user_seed_theo';
UPDATE user SET name = 'Calixto Mendoza'   WHERE id = 'user_seed_alex';
UPDATE user SET name = 'Zephyrine Laurent' WHERE id = 'user_seed_sasha';
UPDATE user SET name = 'Aoife Murphy'      WHERE id = 'user_seed_iris';
UPDATE user SET name = 'Fenwick Bramley'   WHERE id = 'user_seed_jules';
UPDATE user SET name = 'Aurelio Conti'     WHERE id = 'user_seed_noor';
UPDATE user SET name = 'Idony Bramwell'    WHERE id = 'user_seed_sam';
UPDATE user SET name = 'Yael Mizrahi'      WHERE id = 'user_seed_rin';
UPDATE user SET name = 'Hiroshi Tanaka'    WHERE id = 'user_seed_hiroshi';
UPDATE user SET name = 'Min-jun Park'      WHERE id = 'user_seed_minjun';
UPDATE user SET name = 'Yuki Sato'         WHERE id = 'user_seed_yuki';
UPDATE user SET name = 'Mei Chen'          WHERE id = 'user_seed_mei';
UPDATE user SET name = 'Akira Yamamoto'    WHERE id = 'user_seed_akira';
UPDATE user SET name = 'Ji-hye Kim'        WHERE id = 'user_seed_jihye';

-- Mirror the new full names onto bot_profiles.display_name (the AI
-- pipeline reads `u.name` directly so this is mostly belt-and-braces
-- for any UI that joins on bot_profiles).
UPDATE bot_profiles SET name = 'Marisol Velázquez' WHERE id = 'bp_seed_marisol';
UPDATE bot_profiles SET name = 'Dashiell Whitlock' WHERE id = 'bp_seed_dashiell';
UPDATE bot_profiles SET name = 'Soren Lindqvist'   WHERE id = 'bp_seed_soren';
UPDATE bot_profiles SET name = 'Mireille Beaufort' WHERE id = 'bp_seed_mireille';
UPDATE bot_profiles SET name = 'Theron Papadakis'  WHERE id = 'bp_seed_theron';
UPDATE bot_profiles SET name = 'Calixto Mendoza'   WHERE id = 'bp_seed_calixto';
UPDATE bot_profiles SET name = 'Zephyrine Laurent' WHERE id = 'bp_seed_zephyrine';
UPDATE bot_profiles SET name = 'Aoife Murphy'      WHERE id = 'bp_seed_aoife';
UPDATE bot_profiles SET name = 'Fenwick Bramley'   WHERE id = 'bp_seed_fenwick';
UPDATE bot_profiles SET name = 'Aurelio Conti'     WHERE id = 'bp_seed_aurelio';
UPDATE bot_profiles SET name = 'Idony Bramwell'    WHERE id = 'bp_seed_idony';
UPDATE bot_profiles SET name = 'Yael Mizrahi'      WHERE id = 'bp_seed_yael';
UPDATE bot_profiles SET name = 'Hiroshi Tanaka'    WHERE id = 'bp_seed_hiroshi';
UPDATE bot_profiles SET name = 'Min-jun Park'      WHERE id = 'bp_seed_minjun';
UPDATE bot_profiles SET name = 'Yuki Sato'         WHERE id = 'bp_seed_yuki';
UPDATE bot_profiles SET name = 'Mei Chen'          WHERE id = 'bp_seed_mei';
UPDATE bot_profiles SET name = 'Akira Yamamoto'    WHERE id = 'bp_seed_akira';
UPDATE bot_profiles SET name = 'Ji-hye Kim'        WHERE id = 'bp_seed_jihye';
