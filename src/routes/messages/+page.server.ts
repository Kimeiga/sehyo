import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Messages page is accessible but requires auth to use
	// The client-side component will show a sign-in prompt if not authenticated
	return {};
};

