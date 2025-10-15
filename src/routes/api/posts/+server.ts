import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

// GET - Fetch posts for feed
export const GET: RequestHandler = async ({ platform, locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const limit = parseInt(url.searchParams.get('limit') || '20');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const db = new Database(platform.env.DB);
	const posts = await db.getFeedPosts(limit, offset);

	// Get reaction counts for each post
	const postsWithReactions = await Promise.all(
		posts.map(async (post) => {
			const reactionCounts = await db.getReactionCounts('post', post.id);
			return {
				...post,
				reaction_counts: reactionCounts
			};
		})
	);

	return json({ posts: postsWithReactions });
};

// POST - Create a new post
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const formData = await request.formData();
	const content = formData.get('content') as string;
	const image = formData.get('image') as File | null;

	if (!content || content.trim().length === 0) {
		throw error(400, 'Content is required');
	}

	if (content.length > 5000) {
		throw error(400, 'Content is too long (max 5000 characters)');
	}

	let imageUrl: string | null = null;

	// Upload image to R2 if provided
	if (image && image.size > 0) {
		if (image.size > 10 * 1024 * 1024) {
			// 10MB limit
			throw error(400, 'Image is too large (max 10MB)');
		}

		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
		if (!allowedTypes.includes(image.type)) {
			throw error(400, 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP');
		}

		try {
			const imageId = crypto.randomUUID();
			const extension = image.name.split('.').pop() || 'jpg';
			const key = `posts/${locals.user.id}/${imageId}.${extension}`;

			// Upload to R2
			await platform.env.IMAGES.put(key, image.stream(), {
				httpMetadata: {
					contentType: image.type
				}
			});

			// Construct public URL (Cloudflare R2 public bucket URL)
			// In production, you'd use a custom domain or R2 public URL
			imageUrl = `/api/images/${key}`;
		} catch (err) {
			console.error('Error uploading image:', err);
			throw error(500, 'Failed to upload image');
		}
	}

	// Create post in database
	const db = new Database(platform.env.DB);
	const postId = crypto.randomUUID();

	try {
		const post = await db.createPost({
			id: postId,
			user_id: locals.user.id,
			content: content.trim(),
			image_url: imageUrl
		});

		return json({ post }, { status: 201 });
	} catch (err) {
		console.error('Error creating post:', err);
		throw error(500, 'Failed to create post');
	}
};

