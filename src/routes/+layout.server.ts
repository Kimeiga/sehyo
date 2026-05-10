import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

interface AnswerRow {
	id: string;
	user_id: string;
	content: string;
	created_at: number;
	display_name: string | null;
	username: string | null;
	bot_id: string | null;
	comment_count: number;
}

export const load: LayoutServerLoad = async ({ platform, locals, url }) => {
	if (url.searchParams.get('modal') === 'login') {
		throw redirect(302, '/auth/login');
	}

	const db = platform?.env?.DB;
	if (!db) {
		return {
			user: locals.user,
			prompt: null,
			answers: [] as AnswerRow[],
			namesBlurred: !locals.user
		};
	}

	const date = todayUTC();
	const prompt = await db
		.prepare('SELECT id, prompt_text, active_date FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string; prompt_text: string; active_date: string }>();

	let answers: AnswerRow[] = [];
	let myAnswer: AnswerRow | null = null;
	if (prompt) {
		const res = await db
			.prepare(
				`SELECT
					p.id,
					p.user_id,
					p.content,
					p.created_at,
					u.name as display_name,
					u.username,
					u.bot_id,
					(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
				FROM posts p
				JOIN user u ON u.id = p.user_id
				WHERE p.prompt_id = ?
				ORDER BY p.created_at DESC
				LIMIT 200`
			)
			.bind(prompt.id)
			.all<AnswerRow>();
		const all = res.results ?? [];
		if (locals.user) {
			myAnswer = all.find((a) => a.user_id === locals.user!.id) ?? null;
			answers = all.filter((a) => a.user_id !== locals.user!.id);
		} else {
			answers = all;
		}
	}

	// Names are blurred for signed-out viewers AND for signed-in viewers
	// who haven't commented yet. Commenting is the unlock.
	let hasCommented = false;
	if (locals.user) {
		const c = await db
			.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?')
			.bind(locals.user.id)
			.first<{ n: number }>();
		hasCommented = (c?.n ?? 0) > 0;
	}
	const namesBlurred = !locals.user || !hasCommented;

	return {
		user: locals.user,
		prompt: prompt ? { id: prompt.id, text: prompt.prompt_text, active_date: prompt.active_date } : null,
		answers,
		myAnswer,
		namesBlurred
	};
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
