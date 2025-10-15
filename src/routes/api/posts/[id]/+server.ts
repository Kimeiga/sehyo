import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

// GET - Fetch a single post
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const db = new Database(platform.env.DB);
	const post = await db.getPostById(params.id);

	if (!post) {
		throw error(404, 'Post not found');
	}

	const reactionCounts = await db.getReactionCounts('post', post.id);

	return json({
		post: {
			...post,
			reaction_counts: reactionCounts
		}
	});
};

// DELETE - Delete a post
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const db = new Database(platform.env.DB);
	const post = await db.getPostById(params.id);

	if (!post) {
		throw error(404, 'Post not found');
	}

	// Check if user owns the post
	if (post.user_id !== locals.user.id) {
		throw error(403, 'You can only delete your own posts');
	}

	// Delete image from R2 if exists
	if (post.image_url && platform?.env?.IMAGES) {
		try {
			// Extract key from URL (format: /api/images/posts/user_id/image_id.ext)
			const key = post.image_url.replace('/api/images/', '');
			await platform.env.IMAGES.delete(key);
		} catch (err) {
			console.error('Error deleting image from R2:', err);
			// Continue with post deletion even if image deletion fails
		}
	}

	await db.deletePost(params.id);

	return json({ success: true });
};

