import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

// GET - Get friends list or friend requests
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const type = url.searchParams.get('type') || 'friends';
	const db = new Database(platform.env.DB);

	try {
		if (type === 'friends') {
			// Get accepted friends
			const results = await platform.env.DB.prepare(
				`SELECT f.*, 
					u.id as friend_id,
					u.display_name,
					u.username,
					u.profile_picture_url,
					u.bio
				FROM friendships f
				JOIN users u ON (
					CASE 
						WHEN f.user_id = ? THEN u.id = f.friend_id
						ELSE u.id = f.user_id
					END
				)
				WHERE (f.user_id = ? OR f.friend_id = ?) 
				AND f.status = 'accepted'
				ORDER BY f.created_at DESC`
			)
				.bind(locals.user.id, locals.user.id, locals.user.id)
				.all();

			return json({ friends: results.results || [] });
		} else if (type === 'pending') {
			// Get pending friend requests (received)
			const results = await platform.env.DB.prepare(
				`SELECT f.*, 
					u.id as requester_id,
					u.display_name,
					u.username,
					u.profile_picture_url,
					u.bio
				FROM friendships f
				JOIN users u ON u.id = f.user_id
				WHERE f.friend_id = ? AND f.status = 'pending'
				ORDER BY f.created_at DESC`
			)
				.bind(locals.user.id)
				.all();

			return json({ requests: results.results || [] });
		} else if (type === 'sent') {
			// Get sent friend requests
			const results = await platform.env.DB.prepare(
				`SELECT f.*, 
					u.id as recipient_id,
					u.display_name,
					u.username,
					u.profile_picture_url
				FROM friendships f
				JOIN users u ON u.id = f.friend_id
				WHERE f.user_id = ? AND f.status = 'pending'
				ORDER BY f.created_at DESC`
			)
				.bind(locals.user.id)
				.all();

			return json({ requests: results.results || [] });
		}

		return json({ error: 'Invalid type parameter' }, { status: 400 });
	} catch (err) {
		console.error('Error fetching friends:', err);
		throw error(500, 'Failed to fetch friends');
	}
};

// POST - Send friend request
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const { friend_id } = await request.json();

	if (!friend_id) {
		throw error(400, 'Friend ID is required');
	}

	if (friend_id === locals.user.id) {
		throw error(400, 'Cannot send friend request to yourself');
	}

	try {
		// Check if friendship already exists
		const existing = await platform.env.DB.prepare(
			`SELECT * FROM friendships 
			WHERE (user_id = ? AND friend_id = ?) 
			OR (user_id = ? AND friend_id = ?)`
		)
			.bind(locals.user.id, friend_id, friend_id, locals.user.id)
			.first();

		if (existing) {
			if (existing.status === 'accepted') {
				throw error(400, 'Already friends');
			} else if (existing.status === 'pending') {
				throw error(400, 'Friend request already sent');
			} else if (existing.status === 'blocked') {
				throw error(400, 'Cannot send friend request');
			}
		}

		// Create friend request
		const friendshipId = crypto.randomUUID();
		await platform.env.DB.prepare(
			`INSERT INTO friendships (id, user_id, friend_id, status, created_at)
			VALUES (?, ?, ?, 'pending', ?)`
		)
			.bind(friendshipId, locals.user.id, friend_id, Math.floor(Date.now() / 1000))
			.run();

		return json({ success: true, friendship_id: friendshipId }, { status: 201 });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Error sending friend request:', err);
		throw error(500, 'Failed to send friend request');
	}
};

