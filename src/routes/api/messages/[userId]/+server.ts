import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// "Currently typing" cutoff. Generous enough that one typing-ping
// covers a few polling cycles (poll cadence is 2s), but short enough
// that a user who actually stops typing has the indicator vanish
// within ~one breath.
const TYPING_FRESH_SECONDS = 8;

export const GET: RequestHandler = async ({ params, platform, locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const { userId } = params;

	// Optional `?since=<unix-seconds>` — only return messages newer
	// than this timestamp. Used by the polling client to fetch deltas
	// instead of the entire history on every tick.
	const sinceParam = url.searchParams.get('since');
	const since = sinceParam ? parseInt(sinceParam, 10) : null;
	const useSince = Number.isFinite(since);

	// Optional `?peek=1` — skip the read-receipt update so a passive
	// poll while the user is on a different conversation doesn't
	// silently mark the OTHER party's messages as read. Foreground
	// polls of the active conversation should NOT pass peek; they
	// want the read receipt to update.
	const peek = url.searchParams.get('peek') === '1';

	const messagesQuery = useSince
		? `SELECT
				m.id, m.sender_id, m.recipient_id, m.content,
				m.created_at, m.read_at,
				u.username as sender_username,
				u.name as sender_display_name,
				u.image as sender_profile_picture
			FROM messages m
			JOIN user u ON u.id = m.sender_id
			WHERE ((m.sender_id = ? AND m.recipient_id = ?)
			   OR (m.sender_id = ? AND m.recipient_id = ?))
			  AND m.created_at > ?
			ORDER BY m.created_at ASC`
		: `SELECT
				m.id, m.sender_id, m.recipient_id, m.content,
				m.created_at, m.read_at,
				u.username as sender_username,
				u.name as sender_display_name,
				u.image as sender_profile_picture
			FROM messages m
			JOIN user u ON u.id = m.sender_id
			WHERE (m.sender_id = ? AND m.recipient_id = ?)
			   OR (m.sender_id = ? AND m.recipient_id = ?)
			ORDER BY m.created_at ASC`;

	const stmt = useSince
		? db.prepare(messagesQuery).bind(locals.user.id, userId, userId, locals.user.id, since)
		: db.prepare(messagesQuery).bind(locals.user.id, userId, userId, locals.user.id);

	const messages = await stmt.all();

	if (!peek) {
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
	}

	// Did the OTHER party type recently? Used to render the "X is
	// typing…" indicator on the active conversation.
	const typingRow = await db
		.prepare(
			`SELECT last_typed_at FROM typing_indicators
			 WHERE user_id = ? AND recipient_id = ?`
		)
		.bind(userId, locals.user.id)
		.first<{ last_typed_at: number }>();
	const nowSeconds = Math.floor(Date.now() / 1000);
	const otherTyping =
		!!typingRow && nowSeconds - typingRow.last_typed_at <= TYPING_FRESH_SECONDS;

	return json({
		messages: messages.results ?? [],
		other_typing: otherTyping,
		server_now: nowSeconds
	});
};
