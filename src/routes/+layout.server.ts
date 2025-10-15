import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Redirect to /auth/login if modal=login query parameter is present
	if (url.searchParams.get('modal') === 'login') {
		throw redirect(302, '/auth/login');
	}

	return {
		user: locals.user
	};
};

