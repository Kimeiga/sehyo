import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadCommentsForPosts } from '$lib/server/comments';

interface PostRow {
	id: string;
	user_id: string;
	content: string;
	created_at: number;
	prompt_id: string | null;
	is_question: number;
	display_name: string | null;
	username: string | null;
	bot_id: string | null;
	image: string | null;
	prompt_text: string | null;
	prompt_active_date: string | null;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const post = await db
		.prepare(
			`SELECT
				p.id,
				p.user_id,
				p.content,
				p.created_at,
				p.prompt_id,
				p.is_question,
				u.name as display_name,
				u.username,
				u.bot_id,
				u.image,
				dp.prompt_text,
				dp.active_date AS prompt_active_date
			FROM posts p
			JOIN user u ON u.id = p.user_id
			LEFT JOIN daily_prompts dp ON dp.id = p.prompt_id
			WHERE p.id = ?
			LIMIT 1`
		)
		.bind(params.id)
		.first<PostRow>();

	if (!post) throw error(404, 'Post not found');

	const commentsByPost = await loadCommentsForPosts(db, [post.id]);

	return {
		post,
		comments: commentsByPost[post.id] ?? []
	};
};
