import type { RequestHandler } from './$types';
import { createAuth } from '$lib/server/better-auth';

export const GET: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		return new Response('Database not available', { status: 500 });
	}

	const auth = createAuth(platform.env.DB, {
		GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
	});

	return auth.handler(request);
};

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		return new Response('Database not available', { status: 500 });
	}

	const auth = createAuth(platform.env.DB, {
		GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
	});

	return auth.handler(request);
};

