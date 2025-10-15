import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	return {
		user: locals.user,
		showLoginModal: url.searchParams.get('modal') === 'login'
	};
};

