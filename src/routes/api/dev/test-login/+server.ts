// Development-only test login endpoint
// This bypasses Google OAuth for testing purposes
// ONLY works in development mode

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	// Only allow in development mode
	if (!dev) {
		throw error(403, 'Test login only available in development mode');
	}

	const { username } = await request.json();

	if (!username || typeof username !== 'string') {
		throw error(400, 'Username required');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		// Check if test user exists
		let user = await db
			.prepare('SELECT * FROM user WHERE username = ?')
			.bind(username)
			.first();

		// Create test user if doesn't exist
		if (!user) {
			const userId = crypto.randomUUID();
			const email = `${username}@test.local`;
			const displayName = username.charAt(0).toUpperCase() + username.slice(1);

			await db
				.prepare(
					`INSERT INTO user (id, email, username, name, createdAt, updatedAt, emailVerified)
					 VALUES (?, ?, ?, ?, unixepoch(), unixepoch(), 0)`
				)
				.bind(userId, email, username, displayName)
				.run();

			user = await db
				.prepare('SELECT * FROM user WHERE id = ?')
				.bind(userId)
				.first();
		}

		if (!user) {
			throw error(500, 'Failed to create test user');
		}

		// Create session directly in database
		const sessionId = crypto.randomUUID();
		const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

		await db
			.prepare(
				`INSERT INTO sessions (id, user_id, expires_at, created_at)
				 VALUES (?, ?, ?, datetime('now'))`
			)
			.bind(sessionId, user.id, expiresAt)
			.run();

		// Set session cookie (must match hooks.server.ts)
		cookies.set('session', sessionId, {
			path: '/',
			httpOnly: true,
			secure: false, // false for dev
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		return json({
			success: true,
			user: {
				id: user.id,
				username: user.username,
				display_name: user.display_name,
				email: user.email
			}
		});
	} catch (err) {
		console.error('Test login error:', err);
		throw error(500, 'Failed to create test session');
	}
};

