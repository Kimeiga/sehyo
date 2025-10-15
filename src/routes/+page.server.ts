import type { PageServerLoad } from './$types';
import { Database } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform, locals }) => {
	// Allow browsing without authentication
	if (!platform?.env?.DB) {
		return {
			posts: []
		};
	}

	const db = new Database(platform.env.DB);
	const posts = await db.getFeedPosts(20, 0);

	// Get reaction counts for each post and structure user data
	const postsWithReactions = await Promise.all(
		posts.map(async (post: any) => {
			const reactionCounts = await db.getReactionCounts('post', post.id);

			// Structure the user data as a nested object
			const { display_name, username, profile_picture_url, ...postData } = post;

			return {
				...postData,
				user: {
					id: post.user_id,
					display_name,
					username,
					profile_picture_url
				},
				reaction_counts: reactionCounts
			};
		})
	);

	return {
		posts: postsWithReactions
	};
};

