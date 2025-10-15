import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

// DELETE - Delete a comment
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const db = new Database(platform.env.DB);
	
	// Get the comment to check ownership
	const result = await platform.env.DB.prepare(
		'SELECT user_id FROM comments WHERE id = ?'
	)
		.bind(params.id)
		.first();

	if (!result) {
		throw error(404, 'Comment not found');
	}

	// Check if user owns the comment
	if (result.user_id !== locals.user.id) {
		throw error(403, 'You can only delete your own comments');
	}

	// Delete the comment (cascade will handle replies and reactions)
	await platform.env.DB.prepare('DELETE FROM comments WHERE id = ?')
		.bind(params.id)
		.run();

	return json({ success: true });
};

// GET - Get replies to a comment
export const GET: RequestHandler = async ({ params, platform, locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const db = new Database(platform.env.DB);
	const replies = await db.getCommentReplies(params.id, limit, offset);

	// Get reaction counts for each reply and structure user data
	const repliesWithReactions = await Promise.all(
		replies.map(async (reply: any) => {
			const reactionCounts = await db.getReactionCounts('comment', reply.id);

			// Structure the user data as a nested object
			const { display_name, username, profile_picture_url, ...replyData } = reply;

			return {
				...replyData,
				user: {
					id: reply.user_id,
					display_name,
					username,
					profile_picture_url
				},
				reaction_counts: reactionCounts
			};
		})
	);

	return json({ replies: repliesWithReactions });
};

