import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

const MAX_LEN = 4000;

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const { recipient_id, content } = (await request.json()) as {
		recipient_id?: string;
		content?: string;
	};

	if (!recipient_id || typeof content !== 'string') {
		throw error(400, 'recipient_id and content are required');
	}
	const trimmed = content.trim();
	if (!trimmed) throw error(400, 'Message is empty');
	if (trimmed.length > MAX_LEN) throw error(400, 'Message is too long');
	if (recipient_id === locals.user.id) {
		throw error(400, 'Cannot send a message to yourself');
	}

	const database = new Database(db);
	const recipient = await database.getUserById(recipient_id);
	if (!recipient) throw error(404, 'Recipient not found');

	const messageId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO messages (id, sender_id, recipient_id, content, created_at)
			 VALUES (?, ?, ?, ?, unixepoch())`
		)
		.bind(messageId, locals.user.id, recipient_id, trimmed)
		.run();

	return json({ success: true, message_id: messageId });
};
