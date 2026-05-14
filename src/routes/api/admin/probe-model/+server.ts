import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Returns the RAW Workers AI response for a tiny prompt. Used to
 * inspect output shape for models that come back "empty" through
 * the test-model endpoint — most likely the parser (splitAnswers /
 * cleanLine in ai-bots.ts) isn't handling that model family's
 * format.
 *
 *   POST /api/admin/probe-model?model=<workers-ai-id>
 *   Header: x-admin-secret: $ADMIN_SECRET
 *
 * Returns the full result object so we can see whether the model
 * put output in `.response`, `.result.response`, `.output[]`, etc.
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const secret = request.headers.get('x-admin-secret');
	const env = platform?.env;
	if (!env?.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
		throw error(401, 'Unauthorized');
	}
	if (!env.AI) throw error(500, 'AI binding missing');

	const model = url.searchParams.get('model');
	if (!model) throw error(400, 'model query param required');

	const started = Date.now();
	try {
		const res = await env.AI.run(model as Parameters<typeof env.AI.run>[0], {
			messages: [
				{
					role: 'system',
					content:
						'Output exactly 3 lines. Each line is a short statement (5-10 words). No numbering, no labels, no markdown.'
				},
				{ role: 'user', content: 'List 3 unrelated short observations about morning coffee.' }
			],
			temperature: 0.7,
			max_tokens: 200
		});
		return json({
			model,
			latency_ms: Date.now() - started,
			raw_keys: res && typeof res === 'object' ? Object.keys(res) : [],
			raw: res
		});
	} catch (err) {
		return json(
			{ model, error: String(err), latency_ms: Date.now() - started },
			{ status: 200 }
		);
	}
};
