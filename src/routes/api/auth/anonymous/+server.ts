// Anonymous login endpoint
// Uses Better Auth's built-in anonymous plugin

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAuth } from '$lib/server/better-auth';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	try {
		// Create Better Auth instance
		const auth = createAuth(platform.env.DB, {
			GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
		});

		// Use Better Auth's anonymous sign-in API
		const response = await auth.api.signInAnonymous({
			headers: request.headers
		});

		return response;
	} catch (err) {
		console.error('Anonymous login error:', err);
		throw error(500, 'Failed to create anonymous session');
	}
};

