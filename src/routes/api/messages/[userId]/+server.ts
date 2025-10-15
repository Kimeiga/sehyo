import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const { userId } = params;

	try {
		// Get all messages between current user and specified user
		const messages = await db
			.prepare(
				`SELECT 
					m.id,
					m.sender_id,
					m.recipient_id,
					m.cipher_text,
					m.aes_key,
					m.iv,
					m.created_at,
					m.read_at,
					u.username as sender_username,
					u.display_name as sender_display_name,
					u.profile_picture_url as sender_profile_picture
				FROM messages m
				JOIN users u ON u.id = m.sender_id
				WHERE (m.sender_id = ? AND m.recipient_id = ?)
				   OR (m.sender_id = ? AND m.recipient_id = ?)
				ORDER BY m.created_at ASC`
			)
			.bind(locals.user.id, userId, userId, locals.user.id)
			.all();

		// Mark messages as read
		await db
			.prepare(
				`UPDATE messages 
				 SET read_at = unixepoch()
				 WHERE sender_id = ? 
				 AND recipient_id = ? 
				 AND read_at IS NULL`
			)
			.bind(userId, locals.user.id)
			.run();

		return json({
			messages: messages.results || []
		});
	} catch (err) {
		console.error('Get messages error:', err);
		throw error(500, 'Failed to get messages');
	}
};

