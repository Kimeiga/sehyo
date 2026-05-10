import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
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
	image: string | null;
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
			namesBlurred: !locals.user,
			unreadMessageCount: 0
		};
	}

	// Unread DM count for the navbar indicator. Cheap COUNT(*) so it's
	// fine to run on every layout load. Anonymous + signed-out viewers
	// don't receive DMs, so we skip the query entirely.
	let unreadMessageCount = 0;
	if (locals.user && !locals.user.isAnonymous) {
		const r = await db
			.prepare(
				'SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL'
			)
			.bind(locals.user.id)
			.first<{ n: number }>();
		unreadMessageCount = r?.n ?? 0;
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
					u.image,
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
	// who haven't authored anything yet. Either an answer to today's
	// prompt OR a comment counts — any content you've created unlocks.
	let hasInteracted = false;
	if (locals.user) {
		const r = await db
			.prepare(
				`SELECT
					(EXISTS (SELECT 1 FROM posts    WHERE user_id = ?1)) +
					(EXISTS (SELECT 1 FROM comments WHERE user_id = ?1)) AS n`
			)
			.bind(locals.user.id)
			.first<{ n: number }>();
		hasInteracted = (r?.n ?? 0) > 0;
	}
	const namesBlurred = !locals.user || !hasInteracted;

	// Set of user_ids the viewer has commented on at least one post by.
	// This drives the avatar unblur and the "add friend" gate. We pass it
	// as a plain array since svelte:data must be JSON-serialisable.
	let unlockedAvatars: string[] = [];
	if (locals.user) {
		const r = await db
			.prepare(
				`SELECT DISTINCT p.user_id FROM comments c
				 JOIN posts p ON p.id = c.post_id
				 WHERE c.user_id = ?`
			)
			.bind(locals.user.id)
			.all<{ user_id: string }>();
		unlockedAvatars = (r.results ?? []).map((row) => row.user_id);
	}

	// Eagerly load every comment for today's answers + the viewer's own
	// answer. Comments are always-visible in the feed (no click-to-open),
	// so we hydrate everything up-front and avoid a flicker / extra
	// round-trip when the page paints.
	const todayPostIds = [
		...(myAnswer ? [myAnswer.id] : []),
		...answers.map((a) => a.id)
	];
	const todayCommentsByPost = await loadCommentsForPosts(db, todayPostIds);

	return {
		user: locals.user,
		prompt: prompt ? { id: prompt.id, text: prompt.prompt_text, active_date: prompt.active_date } : null,
		answers,
		myAnswer,
		namesBlurred,
		unlockedAvatars,
		todayCommentsByPost,
		unreadMessageCount
	};
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
