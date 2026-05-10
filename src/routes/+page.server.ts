import type { PageServerLoad } from './$types';

interface AnswerRow {
	id: string;
	user_id: string;
	content: string;
	created_at: number;
	display_name: string | null;
	username: string | null;
	bot_id: string | null;
	comment_count: number;
	is_question?: number;
}

interface DayBucket {
	prompt: { id: string; text: string; active_date: string };
	answers: AnswerRow[];
}

const PAST_DAYS_LIMIT = 14;

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return { pastDays: [] as DayBucket[], todayFreePosts: [] as AnswerRow[] };
	}

	const today = todayUTC();

	// Last N daily prompts before today, with their answers, in one query.
	// We fetch up to PAST_DAYS_LIMIT prompt ids first, then their posts.
	const promptRowsRes = await db
		.prepare(
			`SELECT id, prompt_text, active_date
			 FROM daily_prompts
			 WHERE active_date < ?
			 ORDER BY active_date DESC
			 LIMIT ?`
		)
		.bind(today, PAST_DAYS_LIMIT)
		.all<{ id: string; prompt_text: string; active_date: string }>();
	const pastPrompts = promptRowsRes.results ?? [];

	let pastDays: DayBucket[] = [];
	if (pastPrompts.length > 0) {
		const placeholders = pastPrompts.map(() => '?').join(',');
		const ids = pastPrompts.map((p) => p.id);
		const postRowsRes = await db
			.prepare(
				`SELECT
					p.id,
					p.user_id,
					p.prompt_id,
					p.content,
					p.created_at,
					u.name as display_name,
					u.username,
					u.bot_id,
					(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
				FROM posts p
				JOIN user u ON u.id = p.user_id
				WHERE p.prompt_id IN (${placeholders})
				ORDER BY p.created_at DESC`
			)
			.bind(...ids)
			.all<AnswerRow & { prompt_id: string }>();

		const grouped = new Map<string, AnswerRow[]>();
		for (const row of postRowsRes.results ?? []) {
			const list = grouped.get(row.prompt_id) ?? [];
			list.push(row);
			grouped.set(row.prompt_id, list);
		}

		pastDays = pastPrompts.map((p) => ({
			prompt: { id: p.id, text: p.prompt_text, active_date: p.active_date },
			answers: grouped.get(p.id) ?? []
		}));
	}

	// Today's free-form posts (prompt_id IS NULL, created today UTC).
	// SQLite stores created_at as unix seconds; convert today's UTC date to a window.
	const startOfTodayUtc = Math.floor(Date.parse(today + 'T00:00:00Z') / 1000);
	const startOfTomorrowUtc = startOfTodayUtc + 86400;

	const freeRowsRes = await db
		.prepare(
			`SELECT
				p.id,
				p.user_id,
				p.content,
				p.created_at,
				p.is_question,
				u.name as display_name,
				u.username,
				u.bot_id,
				(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
			FROM posts p
			JOIN user u ON u.id = p.user_id
			WHERE p.prompt_id IS NULL
			  AND p.created_at >= ?
			  AND p.created_at < ?
			ORDER BY p.created_at DESC
			LIMIT 100`
		)
		.bind(startOfTodayUtc, startOfTomorrowUtc)
		.all<AnswerRow>();

	return {
		pastDays,
		todayFreePosts: freeRowsRes.results ?? []
	};
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
