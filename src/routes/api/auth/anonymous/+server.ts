// Anonymous login endpoint
// Creates a temporary anonymous user for browsing

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform, cookies }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		// Generate anonymous user
		const userId = crypto.randomUUID();
		const anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(7)}`;
		const displayName = `Guest${Math.floor(Math.random() * 10000)}`;

		await db
			.prepare(
				`INSERT INTO users (id, google_id, email, username, display_name, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())`
			)
			.bind(userId, anonymousId, `${anonymousId}@anonymous.local`, null, displayName)
			.run();

		// Create session
		const sessionId = crypto.randomUUID();
		const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours for anonymous

		await db
			.prepare(
				`INSERT INTO sessions (id, user_id, expires_at, created_at)
				 VALUES (?, ?, ?, unixepoch())`
			)
			.bind(sessionId, userId, expiresAt)
			.run();

		// Set session cookie
		cookies.set('session', sessionId, {
			path: '/',
			httpOnly: true,
			secure: !platform?.env?.DEV,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 // 24 hours
		});

		return json({
			success: true,
			user: {
				id: userId,
				display_name: displayName,
				is_anonymous: true
			}
		});
	} catch (err) {
		console.error('Anonymous login error:', err);
		throw error(500, 'Failed to create anonymous session');
	}
};

