import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$lib/server/better-auth';

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize locals
	event.locals.user = null;
	event.locals.session = null;

	if (!event.platform?.env?.DB) {
		return resolve(event);
	}

	try {
		// Create Better Auth instance
		const auth = createAuth(event.platform.env.DB, {
			GOOGLE_CLIENT_ID: event.platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: event.platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: event.platform.env.GOOGLE_REDIRECT_URI
		});

		// Get session from Better Auth
		const session = await auth.api.getSession({
			headers: event.request.headers
		});

		if (session) {
			event.locals.user = session.user;
			event.locals.session = session.session;
		}
	} catch (error) {
		console.error('Error validating session:', error);
	}

	const response = await resolve(event);
	return response;
};

