import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rotatePrompt, generateSeedAnswers, DEFAULT_MODEL } from '$lib/server/ai-bots';

/**
 * Triggers today's prompt rotation. Idempotent: if today's prompt already
 * exists, returns it without regenerating bot answers. Protected by an
 * ADMIN_SECRET shared header so only the cron worker (and you) can hit it.
 *
 * Pass `?bots=force` to skip the idempotence check and re-roll just the
 * seed-author answers for the existing prompt (dev iteration). User
 * content is preserved.
 *
 * Pass `?model=<workers-ai-id>` to override the LLM for this run. Useful
 * for trying a different model in production without a redeploy.
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
	const model = url.searchParams.get('model') || DEFAULT_MODEL;

	if (url.searchParams.get('bots') === 'force') {
		const result = await generateSeedAnswers(env.DB, env.AI, model);
		return json(result);
	}
	const result = await rotatePrompt(env.DB, env.AI, model);
	return json(result);
};
