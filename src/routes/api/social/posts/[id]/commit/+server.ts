import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isCircleMember, loadSinglePost } from '$lib/server/social';

export const POST: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const post = await db
		.prepare('SELECT id, user_id, kind, circle_id, threshold FROM social_posts WHERE id = ? LIMIT 1')
		.bind(params.id)
		.first<{
			id: string;
			user_id: string;
			kind: string;
			circle_id: string | null;
			threshold: number | null;
		}>();
	if (!post) throw error(404, 'Post not found');
	if (post.kind !== 'plan') throw error(400, 'Only plans accept commitments');
	if (post.user_id === locals.user.id) throw error(400, 'You already own this plan');
	if (post.circle_id && !(await isCircleMember(db, post.circle_id, locals.user.id))) {
		throw error(403, 'You are not in that circle');
	}

	const existing = await db
		.prepare('SELECT id, status FROM social_commitments WHERE post_id = ? AND user_id = ? LIMIT 1')
		.bind(params.id, locals.user.id)
		.first<{ id: string; status: string }>();
	const now = Math.floor(Date.now() / 1000);
	if (!existing) {
		await db
			.prepare(
				`INSERT INTO social_commitments (id, post_id, user_id, status, created_at, updated_at)
				 VALUES (?, ?, ?, 'committed', ?, ?)`
			)
			.bind(crypto.randomUUID(), params.id, locals.user.id, now, now)
			.run();
	} else {
		const nextStatus = existing.status === 'committed' ? 'cancelled' : 'committed';
		await db
			.prepare('UPDATE social_commitments SET status = ?, updated_at = ? WHERE id = ?')
			.bind(nextStatus, now, existing.id)
			.run();
	}

	const countRow = await db
		.prepare(
			`SELECT COUNT(*) AS n
			 FROM social_commitments
			 WHERE post_id = ? AND status = 'committed'`
		)
		.bind(params.id)
		.first<{ n: number }>();
	const status = post.threshold && (countRow?.n ?? 0) >= post.threshold ? 'met' : 'open';
	await db
		.prepare('UPDATE social_posts SET status = ?, updated_at = ? WHERE id = ?')
		.bind(status, now, params.id)
		.run();

	return json({ post: await loadSinglePost(db, params.id, locals.user.id) });
};
