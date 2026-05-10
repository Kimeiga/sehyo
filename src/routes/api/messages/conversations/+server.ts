import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		// Get all unique conversations (users you've messaged with).
		// Uses a CTE so the "other party" id is materialized before the
		// correlated unread-count subquery references it (SQLite can't
		// resolve outer-SELECT aliases inside a subquery WHERE clause).
		const conversations = await db
			.prepare(
				`WITH conv AS (
					SELECT
						CASE WHEN sender_id = ?1 THEN recipient_id ELSE sender_id END AS other_id,
						created_at,
						sender_id,
						recipient_id
					FROM messages
					WHERE sender_id = ?1 OR recipient_id = ?1
				)
				SELECT
					conv.other_id AS user_id,
					u.username,
					u.name AS display_name,
					u.image AS profile_picture_url,
					MAX(conv.created_at) AS last_message_at,
					(SELECT COUNT(*) FROM messages
					 WHERE messages.sender_id = conv.other_id
					   AND messages.recipient_id = ?1
					   AND messages.read_at IS NULL) AS unread_count
				FROM conv
				JOIN user u ON u.id = conv.other_id
				GROUP BY conv.other_id, u.username, u.name, u.image
				ORDER BY last_message_at DESC`
			)
			.bind(locals.user.id)
			.all();

		return json({
			conversations: conversations.results || []
		});
	} catch (err) {
		console.error('Get conversations error:', err);
		throw error(500, 'Failed to get conversations');
	}
};

