import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateUsername } from '$lib/server/usernames';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json({ user: locals.user });
};

/**
 * Update the current user. Right now only username is editable.
 * 400 on invalid/reserved username, 409 on collision with someone else.
 */
export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const incoming = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';

	const v = validateUsername(incoming);
	if (!v.ok) throw error(400, v.reason);

	if (incoming === locals.user.username) {
		return json({ user: locals.user });
	}

	const collision = await db
		.prepare('SELECT id FROM user WHERE username = ? AND id <> ?')
		.bind(incoming, locals.user.id)
		.first<{ id: string }>();
	if (collision) throw error(409, 'That username is already taken.');

	await db
		.prepare('UPDATE user SET username = ? WHERE id = ?')
		.bind(incoming, locals.user.id)
		.run();

	return json({ user: { ...locals.user, username: incoming } });
};
