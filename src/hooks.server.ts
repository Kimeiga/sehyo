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

			// Sync Better Auth user to application users table
			try {
				const existingUser = await event.platform.env.DB
					.prepare('SELECT id FROM users WHERE id = ?')
					.bind(session.user.id)
					.first();

				if (!existingUser) {
					// Create user in application users table
					// For anonymous users, google_id can be empty string
					await event.platform.env.DB
						.prepare(`
							INSERT INTO users (id, google_id, email, display_name, profile_picture_url)
							VALUES (?, ?, ?, ?, ?)
						`)
						.bind(
							session.user.id,
							'', // Anonymous users don't have google_id
							session.user.email,
							session.user.name || 'Anonymous',
							session.user.image || null
						)
						.run();
				}
			} catch (error) {
				console.error('Error syncing user to users table:', error);
			}
		}
	} catch (error) {
		console.error('Error validating session:', error);
	}

	const response = await resolve(event);
	return response;
};

