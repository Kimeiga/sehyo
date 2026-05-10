import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

interface AnswerRow {
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
}

export const load: LayoutServerLoad = async ({ platform, locals, url }) => {
	// Legacy ?modal=login still routes to the login page.
	if (url.searchParams.get('modal') === 'login') {
		throw redirect(302, '/auth/login');
	}

	// The menu is global and shows today's prompt on every page, so its data
	// loads here. The home route's +page.server.ts can still use this via
	// `data` from $page if it needs to.
	const db = platform?.env?.DB;
	if (!db) {
		return { user: locals.user, prompt: null, answers: [] as AnswerRow[] };
	}

	const date = todayUTC();
	const prompt = await db
		.prepare('SELECT id, prompt_text, active_date FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string; prompt_text: string; active_date: string }>();

	if (!prompt) {
		return { user: locals.user, prompt: null, answers: [] as AnswerRow[] };
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
		.all<AnswerRow>();

	const now = Math.floor(Date.now() / 1000);
	const answers = (answersRes.results ?? [])
		.map((a) => {
			const ageHours = Math.max(0, (now - a.created_at) / 3600);
			const engagement = a.reaction_count + a.comment_count * 2;
			const score = (1 + engagement) / Math.pow(ageHours + 2, 1.5);
			return { ...a, score };
		})
		.sort((a, b) => b.score - a.score);

	return {
		user: locals.user,
		prompt: { id: prompt.id, text: prompt.prompt_text, active_date: prompt.active_date },
		answers
	};
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
