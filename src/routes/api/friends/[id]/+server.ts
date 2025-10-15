import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// PATCH - Accept or reject friend request
export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const { action } = await request.json();

	if (!action || !['accept', 'reject'].includes(action)) {
		throw error(400, 'Invalid action. Must be "accept" or "reject"');
	}

	try {
		// Get the friendship
		const friendship = await platform.env.DB.prepare(
			'SELECT * FROM friendships WHERE id = ?'
		)
			.bind(params.id)
			.first();

		if (!friendship) {
			throw error(404, 'Friend request not found');
		}

		// Verify the current user is the recipient
		if (friendship.friend_id !== locals.user.id) {
			throw error(403, 'You can only respond to friend requests sent to you');
		}

		if (friendship.status !== 'pending') {
			throw error(400, 'Friend request is not pending');
		}

		// Update the friendship status
		const newStatus = action === 'accept' ? 'accepted' : 'rejected';
		await platform.env.DB.prepare(
			'UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?'
		)
			.bind(newStatus, Math.floor(Date.now() / 1000), params.id)
			.run();

		return json({ success: true, status: newStatus });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Error updating friend request:', err);
		throw error(500, 'Failed to update friend request');
	}
};

// DELETE - Remove friend or cancel friend request
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	try {
		// Get the friendship
		const friendship = await platform.env.DB.prepare(
			'SELECT * FROM friendships WHERE id = ?'
		)
			.bind(params.id)
			.first();

		if (!friendship) {
			throw error(404, 'Friendship not found');
		}

		// Verify the current user is involved in this friendship
		if (friendship.user_id !== locals.user.id && friendship.friend_id !== locals.user.id) {
			throw error(403, 'You can only remove your own friendships');
		}

		// Delete the friendship
		await platform.env.DB.prepare('DELETE FROM friendships WHERE id = ?')
			.bind(params.id)
			.run();

		return json({ success: true });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Error removing friendship:', err);
		throw error(500, 'Failed to remove friendship');
	}
};

// GET - Check friendship status with a user
export const GET: RequestHandler = async ({ params, url, platform, locals }) => {
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

