import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';

/**
 * Bot Authentication Endpoint
 * 
 * This endpoint allows bots to authenticate and get a session token.
 * Bots use their bot_id to authenticate instead of OAuth.
 * 
 * POST /api/bots/auth
 * Body: { bot_id: string, secret: string }
 * Returns: { session_id: string, user_id: string, bot_profile: object }
 */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	try {
		const { bot_id, secret } = await request.json();

		// Validate input
		if (!bot_id || !secret) {
			return error(400, 'bot_id and secret are required');
		}

		// For now, use a simple secret validation
		// In production, you'd want to use environment variables or a more secure method
		const BOT_SECRET = platform?.env?.BOT_SECRET || 'dev_bot_secret_12345';

		if (secret !== BOT_SECRET) {
			return error(401, 'Invalid bot secret');
		}

		// Get database instance
		const db = getDB(platform);

		// Get bot profile
		const botProfile = await db.prepare(
			`SELECT bp.*, u.id as user_id, u.username, u.name as display_name
			 FROM bot_profiles bp
			 JOIN user u ON bp.user_id = u.id
			 WHERE bp.id = ? AND bp.is_active = 1`
		).bind(bot_id).first();

		if (!botProfile) {
			return error(404, 'Bot profile not found or inactive');
		}

		// Create session for bot
		const sessionId = crypto.randomUUID();
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

		await db.prepare(
			`INSERT INTO sessions (id, user_id, expires_at, created_at)
			 VALUES (?, ?, ?, datetime('now'))`
		).bind(sessionId, botProfile.user_id, expiresAt.toISOString()).run();

		// Set session cookie (optional for bots, but useful for testing)
		cookies.set('session', sessionId, {
			path: '/',
			httpOnly: true,
			secure: false, // Set to true in production
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		return json({
			success: true,
			session_id: sessionId,
			user_id: botProfile.user_id,
			bot_profile: {
				id: botProfile.id,
				name: botProfile.name,
				username: botProfile.username,
				display_name: botProfile.display_name,
				personality: JSON.parse(botProfile.personality as string),
				posting_frequency: botProfile.posting_frequency
			}
		});
	} catch (err) {
		console.error('Bot auth error:', err);
		return error(500, 'Failed to authenticate bot');
	}
};

