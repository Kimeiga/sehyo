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

	// Map Better Auth column names to expected profile page format
	const profileUser = {
		id: user.id,
		display_name: user.name || user.email || 'Anonymous User',
		username: user.username,
		profile_picture_url: user.image,
		sprite_id: user.sprite_id,
		cover_image_url: user.cover_image_url,
		bio: user.bio,
		location: user.location,
		website: user.website,
		created_at: user.createdAt
			? (typeof user.createdAt === 'number'
				? user.createdAt
				: Math.floor(new Date(user.createdAt).getTime() / 1000))
			: null
	};

	console.log('Profile User Data:', {
		id: profileUser.id,
		display_name: profileUser.display_name,
		profile_picture_url: profileUser.profile_picture_url,
		hasImage: !!profileUser.profile_picture_url
	});

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
		profileUser,
		posts: postsWithReactions,
		isOwnProfile: locals.user?.id === params.id
	};
};

