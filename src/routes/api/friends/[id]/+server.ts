import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface FriendshipRow {
	id: string;
	requester_id: string;
	addressee_id: string;
	status: string;
}

// PATCH - Accept or reject a pending friend request
export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Database not available');

	const { action } = (await request.json()) as { action?: string };
	if (!action || !['accept', 'reject'].includes(action)) {
		throw error(400, 'Invalid action. Must be "accept" or "reject"');
	}

	const friendship = await platform.env.DB.prepare(
		'SELECT id, requester_id, addressee_id, status FROM friendships WHERE id = ?'
	)
		.bind(params.id)
		.first<FriendshipRow>();

	if (!friendship) throw error(404, 'Friend request not found');

	// Only the addressee (recipient) can accept/reject. The schema
	// columns are requester_id / addressee_id; the previous version
	// of this handler referenced friend_id which doesn't exist, so
	// every accept/reject silently 403'd.
	if (friendship.addressee_id !== locals.user.id) {
		throw error(403, 'You can only respond to friend requests sent to you');
	}
	if (friendship.status !== 'pending') {
		throw error(400, 'Friend request is not pending');
	}

	const newStatus = action === 'accept' ? 'accepted' : 'rejected';
	await platform.env.DB.prepare(
		'UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?'
	)
		.bind(newStatus, Math.floor(Date.now() / 1000), params.id)
		.run();

	return json({ success: true, status: newStatus });
};

// DELETE - Remove an existing friendship or cancel a pending request
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Database not available');

	const friendship = await platform.env.DB.prepare(
		'SELECT id, requester_id, addressee_id, status FROM friendships WHERE id = ?'
	)
		.bind(params.id)
		.first<FriendshipRow>();

	if (!friendship) throw error(404, 'Friendship not found');

	if (
		friendship.requester_id !== locals.user.id &&
		friendship.addressee_id !== locals.user.id
	) {
		throw error(403, 'You can only remove your own friendships');
	}

	await platform.env.DB.prepare('DELETE FROM friendships WHERE id = ?')
		.bind(params.id)
		.run();

	return json({ success: true });
};

// GET - Inspect friendship state with a specific user (legacy helper)
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Database not available');

	const userId = url.searchParams.get('user_id');
	if (!userId) throw error(400, 'user_id parameter is required');

	const friendship = await platform.env.DB.prepare(
		`SELECT id, requester_id, addressee_id, status FROM friendships
		 WHERE (requester_id = ?1 AND addressee_id = ?2)
		    OR (requester_id = ?2 AND addressee_id = ?1)
		 LIMIT 1`
	)
		.bind(locals.user.id, userId)
		.first<FriendshipRow>();

	if (!friendship) return json({ status: 'none', friendship: null });

	let perspective: string = 'none';
	if (friendship.status === 'accepted') {
		perspective = 'friends';
	} else if (friendship.status === 'pending') {
		perspective =
			friendship.requester_id === locals.user.id ? 'request_sent' : 'request_received';
	} else if (friendship.status === 'rejected') {
		perspective = 'rejected';
	}

	return json({ status: perspective, friendship });
};
