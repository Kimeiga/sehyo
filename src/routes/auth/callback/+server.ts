import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';
import { AuthService, exchangeCodeForTokens, getGoogleUserInfo } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	if (!platform?.env) {
		throw new Error('Platform environment not available');
	}

	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		// User denied access or other error
		throw redirect(302, '/?error=auth_failed');
	}

	if (!code) {
		throw redirect(302, '/?error=no_code');
	}

	try {
		const redirectUri = platform.env.GOOGLE_REDIRECT_URI || `${url.origin}/auth/callback`;

		// Exchange code for tokens
		const tokens = await exchangeCodeForTokens(
			code,
			platform.env.GOOGLE_CLIENT_ID,
			platform.env.GOOGLE_CLIENT_SECRET,
			redirectUri
		);

		// Get user info from Google
		const googleUser = await getGoogleUserInfo(tokens.access_token);

		// Create or update user in database
		const db = new Database(platform.env.DB);
		const authService = new AuthService(db);
		const user = await authService.createOrUpdateUserFromGoogle(googleUser);

		// Create session
		const sessionId = await authService.createSession(user.id);

		// Set session cookie
		cookies.set('session', sessionId, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		// Redirect to home page
		throw redirect(302, '/');
	} catch (err) {
		console.error('Auth callback error:', err);
		throw redirect(302, '/?error=auth_failed');
	}
};

