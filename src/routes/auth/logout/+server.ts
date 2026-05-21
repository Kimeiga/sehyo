import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, platform, cookies }) => {
	const sessionId =
		typeof locals.session?.id === 'string'
			? locals.session.id
			: typeof locals.session?.token === 'string'
				? locals.session.token
				: null;

	if (sessionId && platform?.env?.DB) {
		await platform.env.DB.prepare('DELETE FROM session WHERE id = ? OR token = ?')
			.bind(sessionId, sessionId)
			.run();
	}

	cookies.delete('session', { path: '/' });
	cookies.delete('better-auth.session_token', { path: '/' });
	throw redirect(302, '/');
};
