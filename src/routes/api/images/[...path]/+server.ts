import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET - Serve images from R2
export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.IMAGES) {
		throw error(500, 'Image storage not available');
	}

	const key = params.path;

	try {
		const object = await platform.env.IMAGES.get(key);

		if (!object) {
			throw error(404, 'Image not found');
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set('etag', object.httpEtag);
		headers.set('cache-control', 'public, max-age=31536000, immutable');

		return new Response(object.body, {
			headers
		});
	} catch (err) {
		console.error('Error fetching image from R2:', err);
		throw error(404, 'Image not found');
	}
};

