import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ platform, locals, url }) => {
	if (url.searchParams.get('modal') === 'login') {
		throw redirect(302, '/auth/login');
	}

	const db = platform?.env?.DB;
	let unreadMessageCount = 0;
	if (db && locals.user && !locals.user.isAnonymous) {
		const r = await db
			.prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL')
			.bind(locals.user.id)
			.first<{ n: number }>();
		unreadMessageCount = r?.n ?? 0;
	}

	return {
		user: locals.user,
		prompt: null,
		answers: [] as [],
		myAnswer: null,
		namesBlurred: false,
		unlockedAvatars: [] as string[],
		todayCommentsByPost: {},
		unreadMessageCount,
		hasAnsweredToday: true
	};
};
