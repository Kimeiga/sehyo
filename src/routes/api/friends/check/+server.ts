import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET - Check friendship status with a user
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const userId = url.searchParams.get('user_id');

	if (!userId) {
		throw error(400, 'user_id parameter is required');
	}

	try {
		const friendship = await platform.env.DB.prepare(
			`SELECT * FROM friendships 
			WHERE (user_id = ? AND friend_id = ?) 
			OR (user_id = ? AND friend_id = ?)`
		)
			.bind(locals.user.id, userId, userId, locals.user.id)
			.first();

		if (!friendship) {
			return json({ status: 'none', friendship: null });
		}

		// Determine the relationship from current user's perspective
		let perspective = 'none';
		if (friendship.status === 'accepted') {
			perspective = 'friends';
		} else if (friendship.status === 'pending') {
			if (friendship.user_id === locals.user.id) {
				perspective = 'request_sent';
			} else {
				perspective = 'request_received';
			}
		} else if (friendship.status === 'rejected') {
			perspective = 'rejected';
		}

		return json({ status: perspective, friendship });
	} catch (err) {
		console.error('Error checking friendship status:', err);
		throw error(500, 'Failed to check friendship status');
	}
};

