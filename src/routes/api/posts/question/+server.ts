import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActivePrompt } from '$lib/server/prompts';

const MAX_LEN = 280;

/**
 * Ask a question in the World section. Same gate as /api/posts/free:
 * the user must have answered the active daily prompt first. The post
 * lands with prompt_id = NULL and is_question = 1, which the home
 * feed renders with the prompt-of-the-day headline treatment.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, 'Content is required');
	if (content.length > MAX_LEN)
		throw error(400, `Question is too long (max ${MAX_LEN} characters)`);

	const activePrompt = await getActivePrompt(db);
	if (!activePrompt) throw error(409, 'No active prompt');

	const myAnswer = await db
		.prepare('SELECT id FROM posts WHERE user_id = ? AND prompt_id = ?')
		.bind(locals.user.id, activePrompt.id)
		.first<{ id: string }>();
	if (!myAnswer) throw error(403, "Answer today's question first");

	const postId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO posts (id, user_id, prompt_id, content, is_question)
			 VALUES (?, ?, NULL, ?, 1)`
		)
		.bind(postId, locals.user.id, content)
		.run();

	return json({ id: postId }, { status: 201 });
};
