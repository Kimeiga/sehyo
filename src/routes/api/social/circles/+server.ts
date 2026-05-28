import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCircle, listCircles } from '$lib/server/social';
import { moderateSocialContent, moderationErrorMessage } from '$lib/server/moderation';

export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');
	return json({ circles: await listCircles(db, locals.user.id) });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const name = typeof body?.name === 'string' ? body.name : '';
	const description = typeof body?.description === 'string' ? body.description : null;
	const usernames = Array.isArray(body?.usernames)
		? body.usernames
				.map((v: unknown) => (typeof v === 'string' ? v.replace(/^@/, '').trim().toLowerCase() : ''))
				.filter(Boolean)
				.slice(0, 30)
		: [];

	try {
		const moderation = await moderateSocialContent(platform.env.AI, {
			surface: 'circle',
			text: [name ? `name: ${name}` : '', description ? `description: ${description}` : '']
				.filter(Boolean)
				.join('\n')
		});
		if (!moderation.allowed) {
			throw error(400, moderationErrorMessage(moderation));
		}

		const circle = await createCircle(db, locals.user.id, name, description);
		for (const username of usernames) {
			const u = await db
				.prepare(
					`SELECT id
					 FROM user
					 WHERE lower(username) = ? AND id != ?
					 LIMIT 1`
				)
				.bind(username, locals.user.id)
				.first<{ id: string }>();
			if (!u) continue;
			await db
				.prepare(
					`INSERT OR IGNORE INTO circle_members (id, circle_id, user_id, role, status)
					 VALUES (?, ?, ?, 'member', 'active')`
				)
				.bind(crypto.randomUUID(), circle.id, u.id)
				.run();
		}
		return json({ circle }, { status: 201 });
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : 'Could not create circle');
	}
};
