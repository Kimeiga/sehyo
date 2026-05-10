import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/messages/typing { recipient_id }
 *
 * Records that the current user is currently typing toward
 * `recipient_id`. Clients should call this on keystroke, throttled
 * to roughly once every 2 seconds. The recipient's poll of
 * /api/messages/<sender_id> will surface the typing state if the
 * row is fresh enough (within TYPING_FRESH_SECONDS).
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const { recipient_id } = (await request.json()) as { recipient_id?: string };
	if (!recipient_id) throw error(400, 'recipient_id required');
	if (recipient_id === locals.user.id) {
		// Self-typing is a no-op — silently succeed.
		return json({ success: true });
	}

	await db
		.prepare(
			`INSERT INTO typing_indicators (user_id, recipient_id, last_typed_at)
			 VALUES (?, ?, unixepoch())
			 ON CONFLICT(user_id, recipient_id)
			 DO UPDATE SET last_typed_at = unixepoch()`
		)
		.bind(locals.user.id, recipient_id)
		.run();

	return json({ success: true });
};
