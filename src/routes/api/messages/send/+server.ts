import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const { recipient_id, cipher_text, aes_key, iv } = await request.json();

		if (!recipient_id || !cipher_text || !aes_key || !iv) {
			throw error(400, 'Missing required fields');
		}

		// Verify recipient exists
		const database = new Database(db);
		const recipient = await database.getUserById(recipient_id);
		if (!recipient) {
			throw error(404, 'Recipient not found');
		}

		// Verify recipient has a public key (required for E2E encryption)
		if (!recipient.public_key) {
			throw error(400, 'Recipient has not set up encryption');
		}

		// Create message
		const messageId = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO messages (id, sender_id, recipient_id, cipher_text, aes_key, iv, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
			)
			.bind(messageId, locals.user.id, recipient_id, cipher_text, aes_key, iv)
			.run();

		return json({
			success: true,
			message_id: messageId
		});
	} catch (err) {
		console.error('Send message error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to send message');
	}
};

