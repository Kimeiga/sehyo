import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const TARGETS = new Set(['post', 'comment', 'persona']);

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const targetType = TARGETS.has(body?.target_type) ? body.target_type : null;
	const targetId = typeof body?.target_id === 'string' ? body.target_id : '';
	const username = typeof body?.viewer_username === 'string'
		? body.viewer_username.replace(/^@/, '').trim().toLowerCase()
		: '';
	if (!targetType || !targetId || !username) throw error(400, 'Target and username are required');

	const viewer = await db
		.prepare(
			`SELECT id, username, name
			 FROM user
			 WHERE lower(username) = ?
			   AND (isAnonymous IS NULL OR isAnonymous = 0)
			 LIMIT 1`
		)
		.bind(username)
		.first<{ id: string; username: string | null; name: string | null }>();
	if (!viewer) throw error(404, 'No signed-in user with that username');
	if (viewer.id === locals.user.id) throw error(400, 'You already know it is you');

	let personaId: string | null = null;
	let postId: string | null = null;
	let commentId: string | null = null;

	if (targetType === 'post') {
		const row = await db
			.prepare('SELECT id, user_id, persona_id FROM social_posts WHERE id = ? LIMIT 1')
			.bind(targetId)
			.first<{ id: string; user_id: string; persona_id: string | null }>();
		if (!row) throw error(404, 'Post not found');
		if (row.user_id !== locals.user.id) throw error(403, 'You can only reveal your own posts');
		postId = row.id;
		personaId = row.persona_id;
	} else if (targetType === 'comment') {
		const row = await db
			.prepare('SELECT id, user_id, persona_id FROM social_comments WHERE id = ? LIMIT 1')
			.bind(targetId)
			.first<{ id: string; user_id: string; persona_id: string | null }>();
		if (!row) throw error(404, 'Comment not found');
		if (row.user_id !== locals.user.id) throw error(403, 'You can only reveal your own comments');
		commentId = row.id;
		personaId = row.persona_id;
	} else {
		const row = await db
			.prepare('SELECT id, user_id FROM personas WHERE id = ? LIMIT 1')
			.bind(targetId)
			.first<{ id: string; user_id: string }>();
		if (!row) throw error(404, 'Persona not found');
		if (row.user_id !== locals.user.id) throw error(403, 'You can only reveal your own personas');
		personaId = row.id;
	}

	await db
		.prepare(
			`INSERT OR IGNORE INTO social_reveals
			 (id, owner_user_id, viewer_user_id, persona_id, post_id, comment_id, scope)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			crypto.randomUUID(),
			locals.user.id,
			viewer.id,
			personaId,
			postId,
			commentId,
			targetType
		)
		.run();

	return json({
		ok: true,
		viewer: {
			id: viewer.id,
			username: viewer.username,
			name: viewer.name
		}
	});
};
