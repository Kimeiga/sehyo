import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface CommentRow {
	id: string;
	post_id: string;
	content: string;
	created_at: number;
	user_id: string;
	parent_comment_id: string | null;
	display_name: string | null;
	username: string | null;
	image: string | null;
}

interface PostHeader {
	id: string;
	user_id: string;
	content: string;
	is_question: number;
	prompt_id: string | null;
	prompt_text: string | null;
	post_author_username: string | null;
	post_author_display_name: string | null;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const comment = await db
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
				u.image
			FROM comments c
			LEFT JOIN user u ON u.id = c.user_id
			WHERE c.id = ?
			LIMIT 1`
		)
		.bind(params.id)
		.first<CommentRow>();

	if (!comment) throw error(404, 'Comment not found');

	const post = await db
		.prepare(
			`SELECT
				p.id,
				p.user_id,
				p.content,
				p.is_question,
				p.prompt_id,
				dp.prompt_text,
				u.username AS post_author_username,
				u.name AS post_author_display_name
			FROM posts p
			LEFT JOIN user u ON u.id = p.user_id
			LEFT JOIN daily_prompts dp ON dp.id = p.prompt_id
			WHERE p.id = ?
			LIMIT 1`
		)
		.bind(comment.post_id)
		.first<PostHeader>();

	let parentComment: CommentRow | null = null;
	if (comment.parent_comment_id) {
		parentComment = await db
			.prepare(
				`SELECT c.id, c.post_id, c.content, c.created_at, c.user_id, c.parent_comment_id,
					u.name as display_name, u.username, u.image
				 FROM comments c
				 LEFT JOIN user u ON u.id = c.user_id
				 WHERE c.id = ?
				 LIMIT 1`
			)
			.bind(comment.parent_comment_id)
			.first<CommentRow>();
	}

	const repliesRes = await db
		.prepare(
			`SELECT c.id, c.post_id, c.content, c.created_at, c.user_id, c.parent_comment_id,
				u.name as display_name, u.username, u.image
			 FROM comments c
			 LEFT JOIN user u ON u.id = c.user_id
			 WHERE c.parent_comment_id = ?
			 ORDER BY c.created_at ASC`
		)
		.bind(comment.id)
		.all<CommentRow>();

	return {
		comment,
		post,
		parentComment,
		replies: repliesRes.results ?? []
	};
};
