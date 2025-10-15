import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const { userId } = params;

	try {
		const database = new Database(db);
		const user = await database.getUserById(userId);

		if (!user) {
			throw error(404, 'User not found');
		}

		return json({
			public_key: user.public_key || null
		});
	} catch (err) {
		console.error('Get public key error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to get public key');
	}
};

