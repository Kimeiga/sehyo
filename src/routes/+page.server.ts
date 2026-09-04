import type { PageServerLoad } from './$types';
import { loadSocialFeed, listCircles, listPersonas } from '$lib/server/social';

const emptyHome = () => ({
	feed: [],
	personas: [],
	circles: []
});

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) return emptyHome();

	const viewerId = locals.user?.id ?? null;
	try {
		const [feed, personas, circles] = await Promise.all([
			loadSocialFeed(db, viewerId),
			viewerId ? listPersonas(db, viewerId) : Promise.resolve([]),
			viewerId ? listCircles(db, viewerId) : Promise.resolve([])
		]);

		return {
			feed,
			personas,
			circles
		};
	} catch (error) {
		console.error('Homepage data load failed:', error);
		return emptyHome();
	}
};
