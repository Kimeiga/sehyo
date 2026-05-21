import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActivePrompt } from '$lib/server/prompts';

const MAX_LEN = 2000;

/**
 * Create a free-form post (not tied to a daily prompt).
 *
 * Gating: the user must already have an answer to the active prompt.
 * Once you've answered it, you've earned the ability to post freely
 * until the next prompt is generated. Server-enforced.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, 'Content is required');
	if (content.length > MAX_LEN) throw error(400, `Content is too long (max ${MAX_LEN} characters)`);

	const activePrompt = await getActivePrompt(db);

	if (!activePrompt) throw error(409, 'No active prompt');

	const myAnswer = await db
		.prepare('SELECT id FROM posts WHERE user_id = ? AND prompt_id = ?')
		.bind(locals.user.id, activePrompt.id)
		.first<{ id: string }>();

	if (!myAnswer) {
		throw error(403, "Answer today's question first");
	}

	const postId = crypto.randomUUID();
	await db
		.prepare(`INSERT INTO posts (id, user_id, prompt_id, content) VALUES (?, ?, NULL, ?)`)
		.bind(postId, locals.user.id, content)
		.run();

	return json({ id: postId }, { status: 201 });
};
