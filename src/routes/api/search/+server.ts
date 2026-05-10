import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Global search across users, posts, and comments. Uses LIKE rather than
 * FTS5 — at sehyo's current scale it's plenty, and it doesn't require
 * separate FTS index tables.
 *
 * GET /api/search?q=query&type=all&limit=20
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const query = (url.searchParams.get('q') ?? '').trim();
	const type = url.searchParams.get('type') ?? 'all';
	const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));

	if (!query) return json({ users: [], posts: [], comments: [], total: 0 });

	const like = `%${escapeLike(query)}%`;

	try {
		const [users, posts, comments] = await Promise.all([
			(type === 'all' || type === 'users')
				? db.prepare(
						`SELECT id, name as display_name, username, image as profile_picture_url, bio, sprite_id
						 FROM user
						 WHERE (name LIKE ?1 ESCAPE '\\' OR username LIKE ?1 ESCAPE '\\' OR bio LIKE ?1 ESCAPE '\\')
						   AND (isAnonymous IS NULL OR isAnonymous = 0)
						 ORDER BY createdAt DESC
						 LIMIT ?2`
					).bind(like, limit).all()
				: Promise.resolve({ results: [] }),
			(type === 'all' || type === 'posts')
				? db.prepare(
						`SELECT
							p.id, p.content, p.image_url, p.created_at, p.user_id,
							u.name as user_display_name,
							u.username as user_username,
							u.image as user_profile_picture_url,
							u.sprite_id as user_sprite_id,
							u.bot_id as user_bot_id
						 FROM posts p
						 JOIN user u ON u.id = p.user_id
						 WHERE p.content LIKE ?1 ESCAPE '\\'
						 ORDER BY p.created_at DESC
						 LIMIT ?2`
					).bind(like, limit).all()
				: Promise.resolve({ results: [] }),
			(type === 'all' || type === 'comments')
				? db.prepare(
						`SELECT
							c.id, c.content, c.post_id, c.created_at, c.user_id,
							u.name as user_display_name,
							u.username as user_username,
							u.image as user_profile_picture_url,
							u.sprite_id as user_sprite_id,
							p.content as post_preview
						 FROM comments c
						 JOIN user u ON u.id = c.user_id
						 JOIN posts p ON p.id = c.post_id
						 WHERE c.content LIKE ?1 ESCAPE '\\'
						 ORDER BY c.created_at DESC
						 LIMIT ?2`
					).bind(like, limit).all()
				: Promise.resolve({ results: [] })
		]);

		const postsShaped = (posts.results ?? []).map((p: any) => ({
			...p,
			user: {
				id: p.user_id,
				display_name: p.user_display_name,
				username: p.user_username,
				profile_picture_url: p.user_profile_picture_url,
				sprite_id: p.user_sprite_id,
				bot_id: p.user_bot_id
			}
		}));

		const commentsShaped = (comments.results ?? []).map((c: any) => ({
			...c,
			user: {
				id: c.user_id,
				display_name: c.user_display_name,
				username: c.user_username,
				profile_picture_url: c.user_profile_picture_url,
				sprite_id: c.user_sprite_id
			}
		}));

		return json({
			users: users.results ?? [],
			posts: postsShaped,
			comments: commentsShaped,
			total: (users.results?.length ?? 0) + (posts.results?.length ?? 0) + (comments.results?.length ?? 0)
		});
	} catch (err) {
		console.error('Search error:', err);
		throw error(500, 'Search failed');
	}
};

function escapeLike(s: string) {
	return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
