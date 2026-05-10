import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RESERVED_USERNAMES } from '$lib/server/usernames';

interface ProfileUser {
	id: string;
	name: string | null;
	username: string;
	bio: string | null;
	bot_id: string | null;
	isAnonymous: number | null;
}

interface ProfilePost {
	id: string;
	content: string;
	created_at: number;
	prompt_id: string | null;
	prompt_text: string | null;
	prompt_active_date: string | null;
	is_question: number;
	comment_count: number;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const username = params.username.toLowerCase();
	if (RESERVED_USERNAMES.has(username)) throw error(404, 'Not found');

	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const profileUser = await db
		.prepare(
			`SELECT id, name, username, bio, bot_id, isAnonymous
			 FROM user
			 WHERE LOWER(username) = ?
			 LIMIT 1`
		)
		.bind(username)
		.first<ProfileUser>();

	if (!profileUser) throw error(404, 'Not found');

	// Their last 50 posts (any kind: prompt answers, free-form, questions),
	// joined with the daily_prompt for the prompt-answer case so the
	// profile UI can show "answered: <prompt>" headers.
	const postsRes = await db
		.prepare(
			`SELECT
				p.id,
				p.content,
				p.created_at,
				p.prompt_id,
				p.is_question,
				dp.prompt_text AS prompt_text,
				dp.active_date AS prompt_active_date,
				(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
			FROM posts p
			LEFT JOIN daily_prompts dp ON dp.id = p.prompt_id
			WHERE p.user_id = ?
			ORDER BY p.created_at DESC
			LIMIT 50`
		)
		.bind(profileUser.id)
		.all<ProfilePost>();

	return {
		profileUser,
		posts: postsRes.results ?? []
	};
};
