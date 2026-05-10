import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Today's prompt + its answers, ranked by HN-style decay so fresher and
 * more-engaged answers float to the top while old cold ones sink.
 *
 * Public — no auth required. Anonymous users get the same view as
 * signed-in users; identity-reveal happens client-side after engagement.
 */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const date = todayUTC();

	const prompt = await db
		.prepare('SELECT id, prompt_text, active_date, created_at FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string; prompt_text: string; active_date: string; created_at: number }>();

	if (!prompt) {
		return json({ prompt: null, answers: [], total_answers: 0 });
	}

	const answersRes = await db
		.prepare(
			`SELECT
				p.id,
				p.user_id,
				p.content,
				p.created_at,
				u.name as display_name,
				u.username,
				u.image as profile_picture_url,
				u.sprite_id,
				u.bot_id,
				(SELECT COUNT(*) FROM reactions WHERE target_type = 'post' AND target_id = p.id) AS reaction_count,
				(SELECT COUNT(*) FROM comments  WHERE post_id = p.id) AS comment_count
			FROM posts p
			JOIN user u ON u.id = p.user_id
			WHERE p.prompt_id = ?
			ORDER BY p.created_at DESC
			LIMIT 200`
		)
		.bind(prompt.id)
		.all<{
			id: string;
			user_id: string;
			content: string;
			created_at: number;
			display_name: string | null;
			username: string | null;
			profile_picture_url: string | null;
			sprite_id: number | null;
			bot_id: string | null;
			reaction_count: number;
			comment_count: number;
		}>();

	const now = Math.floor(Date.now() / 1000);
	const answers = (answersRes.results ?? [])
		.map((a) => {
			const ageHours = Math.max(0, (now - a.created_at) / 3600);
			const engagement = a.reaction_count + a.comment_count * 2;
			const score = (1 + engagement) / Math.pow(ageHours + 2, 1.5);
			return { ...a, score };
		})
		.sort((a, b) => b.score - a.score);

	return json({
		prompt: { id: prompt.id, text: prompt.prompt_text, active_date: prompt.active_date },
		answers,
		total_answers: answers.length
	});
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
