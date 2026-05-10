import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rotatePromptIfNeeded, regenerateSeedAnswersForToday } from '$lib/server/ai-bots';

/**
 * Triggers today's prompt rotation. Idempotent: if today's prompt already
 * exists, returns it without regenerating bot answers. Protected by an
 * ADMIN_SECRET shared header so only the cron worker (and you) can hit it.
 *
 * Pass `?bots=force` to skip the idempotence check and re-roll just the
 * seed-author answers for the existing prompt (dev iteration). User
 * content is preserved.
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const secret = request.headers.get('x-admin-secret');
	const env = platform?.env;
	if (!env || !env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
		throw error(401, 'Unauthorized');
	}
	if (!env.DB || !env.AI) {
		throw error(500, 'Bindings missing');
	}
	if (url.searchParams.get('bots') === 'force') {
		const result = await regenerateSeedAnswersForToday(env.DB, env.AI);
		return json(result);
	}
	const result = await rotatePromptIfNeeded(env.DB, env.AI);
	return json(result);
};
