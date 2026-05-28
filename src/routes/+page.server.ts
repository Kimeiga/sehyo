import type { PageServerLoad } from './$types';
import { loadSocialFeed, listCircles, listPersonas } from '$lib/server/social';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return {
			feed: [],
			personas: [],
			circles: []
		};
	}

	const viewerId = locals.user?.id ?? null;
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
};
