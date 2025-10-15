import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';
import { AuthService } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals, platform, cookies }) => {
	if (locals.sessionId && platform?.env?.DB) {
		const db = new Database(platform.env.DB);
		const authService = new AuthService(db);
		await authService.deleteSession(locals.sessionId);
	}

	cookies.delete('session', { path: '/' });
	throw redirect(302, '/');
};

