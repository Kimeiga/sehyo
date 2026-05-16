import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { orchestrateBotRepliesWithTyping } from '$lib/server/ai-bots';

const MAX_LEN = 2000;

/**
 * Post an answer to today's prompt. Requires an authenticated session
 * (which can be anonymous — better-auth's anonymous plugin gives a real
 * user row). Frontend is expected to call signIn.anonymous() if no
 * session exists, then retry.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, 'Content is required');
	if (content.length > MAX_LEN) throw error(400, `Content is too long (max ${MAX_LEN} characters)`);

	const date = todayUTC();
	const prompt = await db
		.prepare('SELECT id FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string }>();

	if (!prompt) throw error(409, 'No active prompt today');

	// One answer per user per prompt. If they already have one, tell the
	// client to use the edit flow instead of creating a duplicate.
	const existing = await db
		.prepare('SELECT id FROM posts WHERE user_id = ? AND prompt_id = ?')
		.bind(locals.user.id, prompt.id)
		.first<{ id: string }>();
	if (existing) {
		throw error(409, 'You already answered this prompt');
	}

	const postId = crypto.randomUUID();
	await db
		.prepare(`INSERT INTO posts (id, user_id, prompt_id, content) VALUES (?, ?, ?, ?)`)
		.bind(postId, locals.user.id, prompt.id, content)
		.run();

	// Bots reply AFTER the post is saved, conversationally: the
	// response returns immediately, then in waitUntil() each bot
	// shows a typing indicator in this post's thread, pauses, and
	// its reply is inserted + pushed live over the WS. Best-effort —
	// the post itself is already committed above.
	const ai = platform?.env?.AI;
	const injectUrl = platform?.env?.TYPING_INJECT_URL;
	const injectSecret = platform?.env?.ADMIN_SECRET;
	if (ai && injectUrl && injectSecret) {
		const work = orchestrateBotRepliesWithTyping(db, ai, {
			postId,
			postContent: content,
			postAuthorName: locals.user.name ?? 'Anonymous',
			injectUrl,
			injectSecret
		}).catch((err) => console.error('bot choreography failed:', err));
		// Keep the worker alive past the response without blocking it.
		if (platform?.context?.waitUntil) platform.context.waitUntil(work);
	}

	return json({ id: postId, prompt_id: prompt.id }, { status: 201 });
};

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
