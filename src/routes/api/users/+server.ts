import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		const users = await db
			.prepare(
				`SELECT id, username, display_name, profile_picture_url, bio, created_at
				 FROM users
				 ORDER BY created_at DESC
				 LIMIT ? OFFSET ?`
			)
			.bind(limit, offset)
			.all();

		return json({
			users: users.results || []
		});
	} catch (err) {
		console.error('Get users error:', err);
		throw error(500, 'Failed to get users');
	}
};

