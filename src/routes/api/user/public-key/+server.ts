import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const { public_key } = await request.json();

		if (!public_key) {
			throw error(400, 'Public key required');
		}

		// Update user's public key
		await db
			.prepare(`UPDATE users SET public_key = ? WHERE id = ?`)
			.bind(public_key, locals.user.id)
			.run();

		return json({
			success: true
		});
	} catch (err) {
		console.error('Update public key error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update public key');
	}
};

