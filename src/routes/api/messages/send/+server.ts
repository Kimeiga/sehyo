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

	// Return the freshly-inserted row joined to its sender so the
	// client can append it directly to the visible list without a
	// follow-up GET / page reload. We re-query (cheap) so created_at
	// reflects the actual unixepoch() value the DB just stamped.
	const inserted = await db
		.prepare(
			`SELECT
				m.id, m.sender_id, m.recipient_id, m.content,
				m.created_at, m.read_at,
				u.username as sender_username,
				u.name as sender_display_name,
				u.image as sender_profile_picture
			FROM messages m
			JOIN user u ON u.id = m.sender_id
			WHERE m.id = ?`
		)
		.bind(messageId)
		.first();

	// Sender just sent — they are no longer "typing" toward this
	// recipient. Clear the indicator so the other party doesn't see
	// a phantom typing dot for the next few seconds.
	await db
		.prepare(`DELETE FROM typing_indicators WHERE user_id = ? AND recipient_id = ?`)
		.bind(locals.user.id, recipient_id)
		.run();

	return json({ success: true, message: inserted });
};
