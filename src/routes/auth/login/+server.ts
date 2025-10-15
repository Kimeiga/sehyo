import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoogleOAuthURL } from '$lib/server/auth';

export const GET: RequestHandler = async ({ platform, url }) => {
	if (!platform?.env) {
		throw new Error('Platform environment not available');
	}

	const state = crypto.randomUUID();
	const redirectUri = platform.env.GOOGLE_REDIRECT_URI || `${url.origin}/auth/callback`;

	const authUrl = getGoogleOAuthURL(platform.env.GOOGLE_CLIENT_ID, redirectUri, state);

	// Store state in cookie for CSRF protection
	const response = redirect(302, authUrl);
	
	// Note: In production, you'd want to set this cookie with proper options
	// For now, we'll validate the state in the callback
	
	return response;
};

