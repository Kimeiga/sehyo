import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { botUser, createBotPost, requireBotSession, rethrowBotApiError, validateBotPostInput } from '$lib/server/bot-api';

interface BotProfileRow {
	user_id: string;
}

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
		const db = getDB(platform);
		const session = await requireBotSession(db, request);
		const payload = await request.json();
		const content = validateBotPostInput(payload.content);
		const post = await createBotPost(db, session, content, payload.image_url || null);

		return json({
			success: true,
			post: {
				id: post.id,
				content: post.content,
				image_url: post.image_url,
				created_at: post.created_at,
				user: botUser(post)
			}
		});
	} catch (err) {
		rethrowBotApiError(err, 'Bot post creation error:', 'Failed to create post');
	}
};

/**
 * Get Bot Posts
 *
 * GET /api/bots/posts?bot_id=<bot_id>&limit=10
 * Returns: { posts: Post[] }
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	try {
		const db = getDB(platform);
		const botId = url.searchParams.get('bot_id');
		const limit = parseInt(url.searchParams.get('limit') || '10');

		if (!botId) {
			return error(400, 'bot_id is required');
		}

		// Get bot's user_id
		const bot = await db
			.prepare(`SELECT user_id FROM bot_profiles WHERE id = ?`)
			.bind(botId)
			.first<BotProfileRow>();

		if (!bot) {
			return error(404, 'Bot not found');
		}

		// Get bot's posts
		const posts = await db
			.prepare(
				`SELECT p.*, u.username, u.name as display_name, u.image as profile_picture_url
			 FROM posts p
			 JOIN user u ON p.user_id = u.id
			 WHERE p.user_id = ?
			 ORDER BY p.created_at DESC
			 LIMIT ?`
			)
			.bind(bot.user_id, limit)
			.all();

		return json({
			success: true,
			posts: posts.results || []
		});
	} catch (err) {
		console.error('Get bot posts error:', err);
		return error(500, 'Failed to get bot posts');
	}
};
