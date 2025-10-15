import type { Handle } from '@sveltejs/kit';
import { Database } from '$lib/server/db';
import { AuthService } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize locals
	event.locals.user = null;
	event.locals.sessionId = null;

	// Get session cookie
	const sessionId = event.cookies.get('session');

	if (sessionId && event.platform?.env?.DB) {
		try {
			const db = new Database(event.platform.env.DB);
			const authService = new AuthService(db);

			// Validate session and get user
			const user = await authService.validateSession(sessionId);
			if (user) {
				event.locals.user = user;
				event.locals.sessionId = sessionId;
			} else {
				// Invalid session, clear cookie
				event.cookies.delete('session', { path: '/' });
			}
		} catch (error) {
			console.error('Error validating session:', error);
			event.cookies.delete('session', { path: '/' });
		}
	}

	const response = await resolve(event);
	return response;
};

