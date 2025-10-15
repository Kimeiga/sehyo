import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET - Search for users
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const query = url.searchParams.get('q');
	const limit = parseInt(url.searchParams.get('limit') || '20');

	if (!query || query.trim().length === 0) {
		return json({ users: [] });
	}

	try {
		// Search by display name or username
		const searchTerm = `%${query.trim()}%`;
		const results = await platform.env.DB.prepare(
			`SELECT 
				id,
				display_name,
				username,
				profile_picture_url,
				bio,
				created_at
			FROM users
			WHERE (display_name LIKE ? OR username LIKE ?)
			AND id != ?
			ORDER BY 
				CASE 
					WHEN username = ? THEN 1
					WHEN display_name = ? THEN 2
					WHEN username LIKE ? THEN 3
					WHEN display_name LIKE ? THEN 4
					ELSE 5
				END,
				display_name ASC
			LIMIT ?`
		)
			.bind(
				searchTerm,
				searchTerm,
				locals.user.id,
				query.trim(),
				query.trim(),
				`${query.trim()}%`,
				`${query.trim()}%`,
				limit
			)
			.all();

		return json({ users: results.results || [] });
	} catch (err) {
		console.error('Error searching users:', err);
		throw error(500, 'Failed to search users');
	}
};

