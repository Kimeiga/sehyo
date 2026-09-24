import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { createBotComment, requireBotSession, requireParentComment, requirePost, rethrowBotApiError, validateBotCommentInput } from '$lib/server/bot-api';

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
		const db = getDB(platform);
		const session = await requireBotSession(db, request);
		const payload = await request.json();
		const content = validateBotCommentInput(payload.post_id, payload.content);
		await requirePost(db, payload.post_id);
		await requireParentComment(db, payload.post_id, payload.parent_comment_id);
		const comment = await createBotComment(
			db,
			session,
			payload.post_id,
			content,
			payload.parent_comment_id || null
		);

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
		rethrowBotApiError(err, 'Bot comment creation error:', 'Failed to create comment');
	}
};
