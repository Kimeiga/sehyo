import { error } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';

export interface BotSessionRow {
	user_id: string;
	username: string | null;
	display_name: string | null;
	bot_id: string | null;
}

export async function requireBotSession(db: D1Database, request: Request): Promise<BotSessionRow> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		throw error(401, 'Missing or invalid Authorization header');
	}

	const session = await db
		.prepare(
			`SELECT s.user_id, u.username, u.name as display_name, bp.id as bot_id
			 FROM sessions s
			 JOIN user u ON s.user_id = u.id
			 LEFT JOIN bot_profiles bp ON bp.user_id = u.id
			 WHERE s.id = ? AND s.expires_at > datetime('now')`
		)
		.bind(authHeader.substring(7))
		.first<BotSessionRow>();

	if (!session) {
		throw error(401, 'Invalid or expired session');
	}
	if (!session.bot_id) {
		throw error(403, 'This endpoint is only for bot accounts');
	}
	return session;
}

export function rethrowBotApiError(err: unknown, context: string, fallback: string): never {
	if (err && typeof err === 'object' && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
		throw err;
	}
	console.error(context, err);
	throw error(500, fallback);
}
