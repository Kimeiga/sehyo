import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	try {
		// Get friends (accepted friendships)
		const friendsResult = await platform.env.DB.prepare(
			`SELECT f.*,
				u.id as friend_id,
				u.display_name,
				u.username,
				u.profile_picture_url,
				u.bio
			FROM friendships f
			JOIN users u ON (
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
				u.display_name,
				u.username,
				u.profile_picture_url,
				u.bio
			FROM friendships f
			JOIN users u ON u.id = f.requester_id
			WHERE f.addressee_id = ? AND f.status = 'pending'
			ORDER BY f.created_at DESC`
		)
			.bind(locals.user.id)
			.all();

		return {
			friends: friendsResult.results || [],
			requests: requestsResult.results || []
		};
	} catch (err) {
		console.error('Error loading friends:', err);
		throw error(500, 'Failed to load friends');
	}
};

