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

		// Friends Find tab list. Filters intentionally:
		//   - Skip the current user.
		//   - Skip anonymous-session users entirely (anon can't be
		//     friended without first becoming a real account, and
		//     surfacing them just clutters the list).
		//   - Skip the legacy "Guest1234"-style users that were
		//     created by the old auth flow before the random-name
		//     anonymous plugin landed.
		//   - Among bots, only include the active seed authors.
		//     The deactivated tech/writer/fitness bots stay out.
		// Order: humans first (sorted by latest post/comment, then
		// signup), then bots after.
		const allUsersResult = await platform.env.DB.prepare(
			`SELECT
				u.id,
				u.name as display_name,
				u.username,
				u.image as profile_picture_url,
				u.bio,
				u.bot_id,
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
			  AND (
			    -- Real human accounts (no bot, not "Guest..." legacy)
			    (u.bot_id IS NULL AND (u.name IS NULL OR u.name NOT LIKE 'Guest%'))
			    OR
			    -- Active seed bots only
			    (u.bot_id LIKE 'seed_%')
			  )
			GROUP BY u.id
			ORDER BY (u.bot_id IS NOT NULL) ASC, last_activity DESC
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

