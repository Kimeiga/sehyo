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
		if (object.httpMetadata?.contentType) {
			headers.set('content-type', object.httpMetadata.contentType);
		}
		if (object.httpMetadata?.contentLanguage) {
			headers.set('content-language', object.httpMetadata.contentLanguage);
		}
		if (object.httpMetadata?.contentDisposition) {
			headers.set('content-disposition', object.httpMetadata.contentDisposition);
		}
		if (object.httpMetadata?.contentEncoding) {
			headers.set('content-encoding', object.httpMetadata.contentEncoding);
		}
		headers.set('etag', object.httpEtag);
		headers.set('cache-control', 'public, max-age=31536000, immutable');

		return new Response(await object.arrayBuffer(), {
			headers
		});
	} catch (err) {
		console.error('Error fetching image from R2:', err);
		throw error(404, 'Image not found');
	}
};
