import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

/**
 * Bot Post Creation Endpoint
 * 
 * This endpoint allows bots to create posts directly without going through the UI.
 * Bots authenticate using their session_id from the auth endpoint.
 * 
 * POST /api/bots/posts
 * Headers: { Authorization: Bearer <session_id> }
 * Body: { content: string, image_url?: string }
 * Returns: { post_id: string, created_at: string }
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		// Get session from Authorization header
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return error(401, 'Missing or invalid Authorization header');
		}

		const sessionId = authHeader.substring(7); // Remove 'Bearer ' prefix

		// Validate session and get user
		const session = await db.prepare(
			`SELECT s.user_id, u.username, u.display_name, bp.id as bot_id
			 FROM sessions s
			 JOIN users u ON s.user_id = u.id
			 LEFT JOIN bot_profiles bp ON bp.user_id = u.id
			 WHERE s.id = ? AND s.expires_at > datetime('now')`
		).bind(sessionId).first();

		if (!session) {
			return error(401, 'Invalid or expired session');
		}

		// Verify this is a bot account
		if (!session.bot_id) {
			return error(403, 'This endpoint is only for bot accounts');
		}

		// Get request body
		const { content, image_url } = await request.json();

		// Validate content
		if (!content || content.trim().length === 0) {
			return error(400, 'Content is required');
		}

		if (content.length > 5000) {
			return error(400, 'Content is too long (max 5000 characters)');
		}

		// Create post
		const postId = crypto.randomUUID();
		
		await db.prepare(
			`INSERT INTO posts (id, user_id, content, image_url, created_at, updated_at)
			 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
		).bind(postId, session.user_id, content.trim(), image_url || null).run();

		// Update bot's last_post_at timestamp
		await db.prepare(
			`UPDATE bot_profiles 
			 SET last_post_at = datetime('now'), updated_at = datetime('now')
			 WHERE id = ?`
		).bind(session.bot_id).run();

		// Get the created post
		const post = await db.prepare(
			`SELECT p.*, u.username, u.display_name
			 FROM posts p
			 JOIN users u ON p.user_id = u.id
			 WHERE p.id = ?`
		).bind(postId).first();

		return json({
			success: true,
			post: {
				id: post.id,
				content: post.content,
				image_url: post.image_url,
				created_at: post.created_at,
				user: {
					id: post.user_id,
					username: post.username,
					display_name: post.display_name
				}
			}
		});
	} catch (err) {
		console.error('Bot post creation error:', err);
		return error(500, 'Failed to create post');
	}
};

/**
 * Get Bot Posts
 * 
 * GET /api/bots/posts?bot_id=<bot_id>&limit=10
 * Returns: { posts: Post[] }
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const botId = url.searchParams.get('bot_id');
		const limit = parseInt(url.searchParams.get('limit') || '10');

		if (!botId) {
			return error(400, 'bot_id is required');
		}

		// Get bot's user_id
		const bot = await db.prepare(
			`SELECT user_id FROM bot_profiles WHERE id = ?`
		).bind(botId).first();

		if (!bot) {
			return error(404, 'Bot not found');
		}

		// Get bot's posts
		const posts = await db.prepare(
			`SELECT p.*, u.username, u.display_name, u.profile_picture_url
			 FROM posts p
			 JOIN users u ON p.user_id = u.id
			 WHERE p.user_id = ?
			 ORDER BY p.created_at DESC
			 LIMIT ?`
		).bind(bot.user_id, limit).all();

		return json({
			success: true,
			posts: posts.results || []
		});
	} catch (err) {
		console.error('Get bot posts error:', err);
		return error(500, 'Failed to get bot posts');
	}
};

