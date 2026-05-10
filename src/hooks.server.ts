import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$lib/server/better-auth';
import { generateUniqueUsername } from '$lib/server/usernames';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	if (!event.platform?.env?.DB) {
		return resolve(event);
	}

	try {
		const url = new URL(event.request.url);
		const baseURL = `${url.protocol}//${url.host}`;

		const auth = createAuth(event.platform.env.DB, {
			GOOGLE_CLIENT_ID: event.platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: event.platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: event.platform.env.GOOGLE_REDIRECT_URI,
			BETTER_AUTH_SECRET: event.platform.env.BETTER_AUTH_SECRET
		}, baseURL);

		const session = await auth.api.getSession({
			headers: event.request.headers
		});

		if (session) {
			event.locals.user = session.user;
			event.locals.session = session.session;

			// Lazily assign a username to any authenticated user that
			// doesn't have one yet. The conditional UPDATE keeps it
			// race-safe — a concurrent request will no-op rather than
			// trample the first one's value.
			if (!session.user.username) {
				try {
					const u = await generateUniqueUsername(
						event.platform.env.DB,
						session.user.name,
						session.user.id
					);
					await event.platform.env.DB
						.prepare(
							"UPDATE user SET username = ? WHERE id = ? AND (username IS NULL OR username = '')"
						)
						.bind(u, session.user.id)
						.run();
					(event.locals.user as { username?: string }).username = u;
				} catch (err) {
					console.error('Lazy username assignment failed:', err);
				}
			}
		}
	} catch (error) {
		console.error('Error validating session:', error);
	}

	return resolve(event);
};

