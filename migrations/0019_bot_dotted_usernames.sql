-- Re-handle every seed bot as firstname.lastname so the @-handles
-- read like fresh Google sign-ins. Display names already carry the
-- full first+last in 0018; this migration makes the username slug
-- match. Routing already accepts dots in the path segment.

UPDATE user SET username = 'marisol.velazquez' WHERE id = 'user_seed_mira';
UPDATE user SET username = 'dashiell.whitlock' WHERE id = 'user_seed_dan';
UPDATE user SET username = 'soren.lindqvist'   WHERE id = 'user_seed_kenji';
UPDATE user SET username = 'mireille.beaufort' WHERE id = 'user_seed_lena';
UPDATE user SET username = 'theron.papadakis'  WHERE id = 'user_seed_theo';
UPDATE user SET username = 'calixto.mendoza'   WHERE id = 'user_seed_alex';
UPDATE user SET username = 'zephyrine.laurent' WHERE id = 'user_seed_sasha';
UPDATE user SET username = 'aoife.murphy'      WHERE id = 'user_seed_iris';
UPDATE user SET username = 'fenwick.bramley'   WHERE id = 'user_seed_jules';
UPDATE user SET username = 'aurelio.conti'     WHERE id = 'user_seed_noor';
UPDATE user SET username = 'idony.bramwell'    WHERE id = 'user_seed_sam';
UPDATE user SET username = 'yael.mizrahi'      WHERE id = 'user_seed_rin';
UPDATE user SET username = 'hiroshi.tanaka'    WHERE id = 'user_seed_hiroshi';
UPDATE user SET username = 'minjun.park'       WHERE id = 'user_seed_minjun';
UPDATE user SET username = 'yuki.sato'         WHERE id = 'user_seed_yuki';
UPDATE user SET username = 'mei.chen'          WHERE id = 'user_seed_mei';
UPDATE user SET username = 'akira.yamamoto'    WHERE id = 'user_seed_akira';
UPDATE user SET username = 'jihye.kim'         WHERE id = 'user_seed_jihye';
