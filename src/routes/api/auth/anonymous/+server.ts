// Anonymous login endpoint
// Creates a temporary anonymous user for browsing
// Uses Better Auth's user and session tables

import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
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
		const email = `${anonymousId}@anonymous.local`;
		const now = new Date().toISOString();

		// Insert into Better Auth's user table
		await db
			.prepare(
				`INSERT INTO user (id, email, emailVerified, name, image, createdAt, updatedAt)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(userId, email, 0, displayName, null, now, now)
			.run();

		// Create session in Better Auth's session table
		const sessionToken = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
		const createdAt = now;
		const updatedAt = now;

		await db
			.prepare(
				`INSERT INTO session (id, userId, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(sessionToken, userId, expiresAt.toISOString(), null, null, createdAt, updatedAt)
			.run();

		// Set Better Auth session cookie
		cookies.set('better-auth.session_token', sessionToken, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 // 24 hours
		});

		return json({
			success: true,
			user: {
				id: userId,
				name: displayName,
				email: email,
				is_anonymous: true
			}
		});
	} catch (err) {
		console.error('Anonymous login error:', err);
		throw error(500, 'Failed to create anonymous session');
	}
};

