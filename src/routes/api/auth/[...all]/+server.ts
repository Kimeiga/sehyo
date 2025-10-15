import type { RequestHandler } from './$types';
import { createAuth } from '$lib/server/better-auth';

export const GET: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		console.error('Database not available in platform.env');
		return new Response('Database not available', { status: 500 });
	}

	try {
		const auth = createAuth(platform.env.DB, {
			GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
		});

		return await auth.handler(request);
	} catch (error) {
		console.error('Error in Better Auth GET handler:', error);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
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

