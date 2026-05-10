import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

interface AnswerRow {
	id: string;
	user_id: string;
	content: string;
	created_at: number;
	display_name: string | null;
	bot_id: string | null;
	comment_count: number;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) throw error(404, 'Not found');

	const prompt = await db
		.prepare('SELECT id, prompt_text, active_date FROM daily_prompts WHERE active_date = ?')
		.bind(params.date)
		.first<{ id: string; prompt_text: string; active_date: string }>();

	if (!prompt) throw error(404, 'No prompt for this date');

	const res = await db
		.prepare(
			`SELECT
				p.id,
				p.user_id,
				p.content,
				p.created_at,
				u.name as display_name,
				u.bot_id,
				(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
			FROM posts p
			JOIN user u ON u.id = p.user_id
			WHERE p.prompt_id = ?
			ORDER BY p.created_at DESC
			LIMIT 500`
		)
		.bind(prompt.id)
		.all<AnswerRow>();

	return {
		archive: {
			prompt: { id: prompt.id, text: prompt.prompt_text, active_date: prompt.active_date },
			answers: res.results ?? []
		}
	};
};
