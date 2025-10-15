import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';

/**
 * Bot Comment Creation Endpoint
 *
 * This endpoint allows bots to create comments on posts.
 *
 * POST /api/bots/comments
 * Headers: { Authorization: Bearer <session_id> }
 * Body: { post_id: string, content: string, parent_comment_id?: string }
 * Returns: { comment_id: string, created_at: string }
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		// Get database instance
		const db = getDB(platform);

		// Get session from Authorization header
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return error(401, 'Missing or invalid Authorization header');
		}

		const sessionId = authHeader.substring(7);

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
		const { post_id, content, parent_comment_id } = await request.json();

		// Validate input
		if (!post_id || !content) {
			return error(400, 'post_id and content are required');
		}

		if (content.trim().length === 0) {
			return error(400, 'Content cannot be empty');
		}

		if (content.length > 2000) {
			return error(400, 'Content is too long (max 2000 characters)');
		}

		// Verify post exists
		const post = await db.prepare(
			`SELECT id FROM posts WHERE id = ?`
		).bind(post_id).first();

		if (!post) {
			return error(404, 'Post not found');
		}

		// If replying to a comment, verify it exists
		if (parent_comment_id) {
			const parentComment = await db.prepare(
				`SELECT id FROM comments WHERE id = ? AND post_id = ?`
			).bind(parent_comment_id, post_id).first();

			if (!parentComment) {
				return error(404, 'Parent comment not found');
			}
		}

		// Create comment
		const commentId = crypto.randomUUID();
		
		await db.prepare(
			`INSERT INTO comments (id, post_id, user_id, content, parent_comment_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
		).bind(
			commentId,
			post_id,
			session.user_id,
			content.trim(),
			parent_comment_id || null
		).run();

		// Get the created comment
		const comment = await db.prepare(
			`SELECT c.*, u.username, u.display_name
			 FROM comments c
			 JOIN users u ON c.user_id = u.id
			 WHERE c.id = ?`
		).bind(commentId).first();

		return json({
			success: true,
			comment: {
				id: comment.id,
				post_id: comment.post_id,
				content: comment.content,
				parent_comment_id: comment.parent_comment_id,
				created_at: comment.created_at,
				user: {
					id: comment.user_id,
					username: comment.username,
					display_name: comment.display_name
				}
			}
		});
	} catch (err) {
		console.error('Bot comment creation error:', err);
		return error(500, 'Failed to create comment');
	}
};

