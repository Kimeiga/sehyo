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
		// Get all unique conversations (users you've messaged with)
		const conversations = await db
			.prepare(
				`SELECT DISTINCT
					CASE 
						WHEN sender_id = ? THEN recipient_id
						ELSE sender_id
					END as user_id,
					u.username,
					u.display_name,
					u.profile_picture_url,
					MAX(m.created_at) as last_message_at,
					(SELECT COUNT(*) FROM messages 
					 WHERE sender_id = user_id 
					 AND recipient_id = ? 
					 AND read_at IS NULL) as unread_count
				FROM messages m
				JOIN users u ON u.id = CASE 
					WHEN m.sender_id = ? THEN m.recipient_id
					ELSE m.sender_id
				END
				WHERE sender_id = ? OR recipient_id = ?
				GROUP BY user_id
				ORDER BY last_message_at DESC`
			)
			.bind(locals.user.id, locals.user.id, locals.user.id, locals.user.id, locals.user.id)
			.all();

		return json({
			conversations: conversations.results || []
		});
	} catch (err) {
		console.error('Get conversations error:', err);
		throw error(500, 'Failed to get conversations');
	}
};

