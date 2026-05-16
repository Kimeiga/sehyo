import type { D1Database } from '@cloudflare/workers-types';

export interface CommentRow {
	id: string;
	post_id: string;
	content: string;
	created_at: number;
	user_id: string;
	parent_comment_id: string | null;
	user: {
		id: string;
		display_name: string | null;
		username: string | null;
		profile_picture_url: string | null;
	};
}

// D1 caps bound parameters at 100 per query. The home page can
// gather several hundred post ids (30 days of prompts + 200 past
// free posts), so a single IN (?, ?, …) blows the limit and D1
// throws "too many SQL variables". Chunk well under the cap.
const D1_PARAM_CHUNK = 90;

export async function loadCommentsForPosts(
	db: D1Database,
	postIds: string[]
): Promise<Record<string, CommentRow[]>> {
	if (postIds.length === 0) return {};

	const grouped: Record<string, CommentRow[]> = {};

	for (let i = 0; i < postIds.length; i += D1_PARAM_CHUNK) {
		const chunk = postIds.slice(i, i + D1_PARAM_CHUNK);
		const placeholders = chunk.map(() => '?').join(',');
		const res = await db
			.prepare(
				`SELECT
					c.id,
					c.post_id,
					c.content,
					c.created_at,
					c.user_id,
					c.parent_comment_id,
					u.name as display_name,
					u.username,
					u.image as profile_picture_url
				FROM comments c
				LEFT JOIN user u ON u.id = c.user_id
				WHERE c.post_id IN (${placeholders})
				ORDER BY c.created_at ASC`
			)
			.bind(...chunk)
			.all<{
				id: string;
				post_id: string;
				content: string;
				created_at: number;
				user_id: string;
				parent_comment_id: string | null;
				display_name: string | null;
				username: string | null;
				profile_picture_url: string | null;
			}>();

		for (const row of res.results ?? []) {
			const item: CommentRow = {
				id: row.id,
				post_id: row.post_id,
				content: row.content,
				created_at: row.created_at,
				user_id: row.user_id,
				parent_comment_id: row.parent_comment_id,
				user: {
					id: row.user_id,
					display_name: row.display_name,
					username: row.username,
					profile_picture_url: row.profile_picture_url
				}
			};
			(grouped[row.post_id] ??= []).push(item);
		}
	}

	return grouped;
}
