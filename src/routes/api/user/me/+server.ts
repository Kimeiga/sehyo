import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateUsername } from '$lib/server/usernames';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json({ user: locals.user });
};

const BIO_MAX = 280;

/**
 * Update the current user. Accepts { username?, bio? }. Either or both
 * may be provided; only the supplied fields are touched.
 *
 * 400 on invalid/reserved username or oversize bio.
 * 409 on username collision with someone else.
 */
export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);

	const wantsUsername = typeof body?.username === 'string';
	const wantsBio = typeof body?.bio === 'string';
	if (!wantsUsername && !wantsBio) throw error(400, 'Nothing to update.');

	let nextUsername: string | undefined;
	if (wantsUsername) {
		nextUsername = body.username.trim().toLowerCase();
		const v = validateUsername(nextUsername!);
		if (!v.ok) throw error(400, v.reason);
		if (nextUsername !== locals.user.username) {
			const collision = await db
				.prepare('SELECT id FROM user WHERE username = ? AND id <> ?')
				.bind(nextUsername, locals.user.id)
				.first<{ id: string }>();
			if (collision) throw error(409, 'That username is already taken.');
		}
	}

	let nextBio: string | null | undefined;
	if (wantsBio) {
		const trimmed = body.bio.trim();
		if (trimmed.length > BIO_MAX) throw error(400, `Bio is too long (max ${BIO_MAX} characters).`);
		nextBio = trimmed.length === 0 ? null : trimmed;
	}

	// Build the UPDATE dynamically for whichever fields were provided.
	const sets: string[] = [];
	const binds: unknown[] = [];
	if (nextUsername !== undefined) {
		sets.push('username = ?');
		binds.push(nextUsername);
	}
	if (nextBio !== undefined) {
		sets.push('bio = ?');
		binds.push(nextBio);
	}
	binds.push(locals.user.id);

	await db
		.prepare(`UPDATE user SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...binds)
		.run();

	return json({
		user: {
			...locals.user,
			...(nextUsername !== undefined ? { username: nextUsername } : {}),
			...(nextBio !== undefined ? { bio: nextBio } : {})
		}
	});
};
