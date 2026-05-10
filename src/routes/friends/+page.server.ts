import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform, locals }) => {
	// Allow viewing friends page but show sign-in prompt if not authenticated
	if (!locals.user) {
		return {
			friends: [],
			requests: [],
			allUsers: []
		};
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	try {
		// Get friends (accepted friendships)
		const friendsResult = await platform.env.DB.prepare(
			`SELECT f.*,
				u.id as friend_id,
				u.name as display_name,
				u.username,
				u.image as profile_picture_url,
				u.bio
			FROM friendships f
			JOIN user u ON (
				CASE
					WHEN f.requester_id = ? THEN u.id = f.addressee_id
					ELSE u.id = f.requester_id
				END
			)
			WHERE (f.requester_id = ? OR f.addressee_id = ?)
			AND f.status = 'accepted'
			ORDER BY f.created_at DESC`
		)
			.bind(locals.user.id, locals.user.id, locals.user.id)
			.all();

		// Get pending friend requests (received)
		const requestsResult = await platform.env.DB.prepare(
			`SELECT f.*,
				u.id as requester_id,
				u.name as display_name,
				u.username,
				u.image as profile_picture_url,
				u.bio
			FROM friendships f
			JOIN user u ON u.id = f.requester_id
			WHERE f.addressee_id = ? AND f.status = 'pending'
			ORDER BY f.created_at DESC`
		)
			.bind(locals.user.id)
			.all();

		// Get all users (excluding anonymous users and current user),
		// ordered by most recent activity (latest post or comment) so
		// the Find tab feels alive instead of frozen at "newest signups".
		const allUsersResult = await platform.env.DB.prepare(
			`SELECT
				u.id,
				u.name as display_name,
				u.username,
				u.image as profile_picture_url,
				u.bio,
				u.createdAt as created_at,
				COALESCE(
					MAX(p.created_at),
					MAX(c.created_at),
					u.createdAt
				) AS last_activity
			FROM user u
			LEFT JOIN posts p ON p.user_id = u.id
			LEFT JOIN comments c ON c.user_id = u.id
			WHERE u.id != ?
			  AND (u.isAnonymous IS NULL OR u.isAnonymous = 0)
			GROUP BY u.id
			ORDER BY last_activity DESC
			LIMIT 100`
		)
			.bind(locals.user.id)
			.all();

		return {
			friends: friendsResult.results || [],
			requests: requestsResult.results || [],
			allUsers: allUsersResult.results || []
		};
	} catch (err) {
		console.error('Error loading friends:', err);
		throw error(500, 'Failed to load friends');
	}
};

