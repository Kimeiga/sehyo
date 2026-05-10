import type { PageServerLoad } from './$types';
import { loadCommentsForPosts } from '$lib/server/comments';

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
	image: string | null;
}

interface PastPrompt {
	id: string;
	text: string;
	active_date: string;
	created_at: number;
	answers: AnswerRow[];
}

// A single timeline node, sorted chronologically. The home page
// renders these below the "World" section so older daily questions
// and older user posts are interleaved by recency, the way an
// activity feed normally would.
type TimelineItem =
	| { kind: 'prompt'; created_at: number; data: PastPrompt }
	| { kind: 'post'; created_at: number; data: AnswerRow };

const PAST_DAYS_LIMIT = 30;
const PAST_FREE_POSTS_LIMIT = 200;

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return { timeline: [] as TimelineItem[], todayFreePosts: [] as AnswerRow[] };
	}

	const today = todayUTC();
	const startOfTodayUtc = Math.floor(Date.parse(today + 'T00:00:00Z') / 1000);
	const startOfTomorrowUtc = startOfTodayUtc + 86400;

	// ── Past daily prompts (everything before today) ─────────────────
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

	let pastDays: PastPrompt[] = [];
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
					u.image,
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
			id: p.id,
			text: p.prompt_text,
			active_date: p.active_date,
			// active_date is YYYY-MM-DD UTC. Treat the prompt as
			// "appearing" at the start of its day in unix seconds so
			// it sorts naturally alongside user posts that have a
			// real created_at timestamp.
			created_at: Math.floor(Date.parse(p.active_date + 'T00:00:00Z') / 1000),
			answers: grouped.get(p.id) ?? []
		}));
	}

	// ── Today's free-form posts (rendered inside the World section) ──
	const todayFreeRes = await db
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
				u.image,
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
	const todayFreePosts = todayFreeRes.results ?? [];

	// ── Older free-form posts (everything before today) ──────────────
	// These will be interleaved with past daily prompts in the
	// chronological timeline below the World section.
	const pastFreeRes = await db
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
				u.image,
				(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
			FROM posts p
			JOIN user u ON u.id = p.user_id
			WHERE p.prompt_id IS NULL
			  AND p.created_at < ?
			ORDER BY p.created_at DESC
			LIMIT ?`
		)
		.bind(startOfTodayUtc, PAST_FREE_POSTS_LIMIT)
		.all<AnswerRow>();
	const pastFreePosts = pastFreeRes.results ?? [];

	// ── Build the unified timeline ──────────────────────────────────
	const timeline: TimelineItem[] = [
		...pastDays.map<TimelineItem>((d) => ({ kind: 'prompt', created_at: d.created_at, data: d })),
		...pastFreePosts.map<TimelineItem>((p) => ({ kind: 'post', created_at: p.created_at, data: p }))
	].sort((a, b) => b.created_at - a.created_at);

	// Eagerly hydrate comments for everything visible on this page.
	const allPostIds: string[] = [];
	for (const item of timeline) {
		if (item.kind === 'prompt') {
			for (const a of item.data.answers) allPostIds.push(a.id);
		} else {
			allPostIds.push(item.data.id);
		}
	}
	for (const p of todayFreePosts) allPostIds.push(p.id);
	const commentsByPost = await loadCommentsForPosts(db, allPostIds);

	return {
		timeline,
		todayFreePosts,
		commentsByPost
	};
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
