import type { PageServerLoad } from './$types';
import { Database } from '$lib/server/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	// Allow viewing profiles without authentication
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const db = new Database(platform.env.DB);
	const user = await db.getUserById(params.id);

	if (!user) {
		throw error(404, 'User not found');
	}

	// Get user's posts
	const posts = await db.getUserPosts(params.id, 20, 0);

	// Get reaction counts for each post and transform user data
	const postsWithReactions = await Promise.all(
		posts.map(async (post: any) => {
			const reactionCounts = await db.getReactionCounts('post', post.id);
			return {
				...post,
				user: {
					id: post.user_id,
					display_name: post.display_name,
					profile_picture_url: post.profile_picture_url
				},
				reaction_counts: reactionCounts
			};
		})
	);

	return {
		profileUser: user,
		posts: postsWithReactions,
		isOwnProfile: locals.user?.id === params.id
	};
};

