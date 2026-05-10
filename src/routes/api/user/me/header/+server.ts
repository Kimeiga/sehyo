import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const env = platform?.env;
	if (!env?.DB) throw error(500, 'Database not available');
	if (!env.IMAGES) throw error(500, 'Image bucket missing');

	const formData = await request.formData();
	const image = formData.get('image');
	if (!(image instanceof File)) throw error(400, 'No image provided');
	if (image.size === 0) throw error(400, 'Empty image');
	if (image.size > MAX_BYTES) throw error(400, 'Image is too large (max 10MB)');
	if (!ALLOWED.has(image.type)) throw error(400, 'Invalid image type');

	const ext = (image.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
	const key = `users/${locals.user.id}/header-${crypto.randomUUID()}.${ext}`;

	try {
		await env.IMAGES.put(key, image.stream(), {
			httpMetadata: { contentType: image.type }
		});
	} catch (err) {
		console.error('Header upload failed:', err);
		throw error(500, 'Failed to upload image');
	}

	const url = `/api/images/${key}`;
	await env.DB
		.prepare('UPDATE user SET header_image_url = ? WHERE id = ?')
		.bind(url, locals.user.id)
		.run();

	return json({ header_image_url: url });
};

export const DELETE: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const env = platform?.env;
	if (!env?.DB) throw error(500, 'Database not available');

	// Look up current header so we can clean up R2.
	const row = await env.DB
		.prepare('SELECT header_image_url FROM user WHERE id = ?')
		.bind(locals.user.id)
		.first<{ header_image_url: string | null }>();

	if (row?.header_image_url && env.IMAGES) {
		const key = row.header_image_url.replace(/^\/api\/images\//, '');
		try { await env.IMAGES.delete(key); } catch (err) {
			console.error('R2 delete (header) failed:', err);
		}
	}

	await env.DB
		.prepare('UPDATE user SET header_image_url = NULL WHERE id = ?')
		.bind(locals.user.id)
		.run();

	return json({ header_image_url: null });
};
