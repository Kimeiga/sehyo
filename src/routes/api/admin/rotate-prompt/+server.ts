import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rotatePromptIfNeeded } from '$lib/server/ai-bots';

/**
 * Triggers today's prompt rotation. Idempotent: if today's prompt already
 * exists, returns it without regenerating bot answers. Protected by an
 * ADMIN_SECRET shared header so only the cron worker (and you) can hit it.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const secret = request.headers.get('x-admin-secret');
	const env = platform?.env;
	if (!env || !env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
		throw error(401, 'Unauthorized');
	}
	if (!env.DB || !env.AI) {
		throw error(500, 'Bindings missing');
	}
	const result = await rotatePromptIfNeeded(env.DB, env.AI);
	return json(result);
};
