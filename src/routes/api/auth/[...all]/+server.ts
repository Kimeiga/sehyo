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
		console.error('Database not available in platform.env');
		return new Response('Database not available', { status: 500 });
	}

	try {
		// Log the request URL for debugging
		const url = new URL(request.url);
		console.log('Better Auth POST request:', {
			pathname: url.pathname,
			method: request.method
		});

		const auth = createAuth(platform.env.DB, {
			GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
		});

		const response = await auth.handler(request);

		// Log response status
		console.log('Better Auth POST response:', {
			status: response.status,
			statusText: response.statusText
		});

		return response;
	} catch (error) {
		console.error('Error in Better Auth POST handler:', error);
		console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
		return new Response(JSON.stringify({
			error: String(error),
			message: error instanceof Error ? error.message : 'Unknown error'
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

