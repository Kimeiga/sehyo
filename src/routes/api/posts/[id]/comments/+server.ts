import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

// GET - Fetch comments for a post (public - no auth required)
export const GET: RequestHandler = async ({ params, platform, url }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const db = new Database(platform.env.DB);
	const comments = await db.getPostComments(params.id, limit, offset);

	// Get reaction counts for each comment and structure user data
	const commentsWithReactions = await Promise.all(
		comments.map(async (comment: any) => {
			const reactionCounts = await db.getReactionCounts('comment', comment.id);

			// Structure the user data as a nested object
			const { display_name, username, profile_picture_url, ...commentData } = comment;

			return {
				...commentData,
				user: {
					id: comment.user_id,
					display_name,
					username,
					profile_picture_url
				},
				reaction_counts: reactionCounts
			};
		})
	);

	return json({ comments: commentsWithReactions });
};

// POST - Create a new comment
export const POST: RequestHandler = async ({ request, params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const { content, parent_comment_id } = await request.json();

	if (!content || content.trim().length === 0) {
		throw error(400, 'Content is required');
	}

	if (content.length > 2000) {
		throw error(400, 'Comment is too long (max 2000 characters)');
	}

	const db = new Database(platform.env.DB);
	const commentId = crypto.randomUUID();

	try {
		const comment = await db.createComment({
			id: commentId,
			post_id: params.id,
			user_id: locals.user.id,
			content: content.trim(),
			parent_comment_id: parent_comment_id || null
		});

		return json({ comment }, { status: 201 });
	} catch (err) {
		console.error('Error creating comment:', err);
		throw error(500, 'Failed to create comment');
	}
};

