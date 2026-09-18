// Anonymous login endpoint using Better Auth's configured anonymous plugin.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAuth } from '$lib/server/better-auth';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	try {
		const auth = createAuth(platform.env.DB, {
			GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI,
			BETTER_AUTH_SECRET: platform.env.BETTER_AUTH_SECRET
		});

		// Server API calls return data by default. Ask for a Response so
		// SvelteKit receives the real status, headers and session cookies.
		return await auth.api.signInAnonymous({
			headers: request.headers,
			asResponse: true
		});
	} catch (err) {
		console.error('Anonymous login error:', err);
		throw error(500, 'Failed to create anonymous session');
	}
};
