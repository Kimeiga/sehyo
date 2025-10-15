import type { PageServerLoad, Actions } from './$types';
import { Database } from '$lib/server/db';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	return {
		user: locals.user
	};
};

export const actions: Actions = {
	updateProfile: async ({ request, platform, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const formData = await request.formData();
		const displayName = formData.get('display_name') as string;
		const username = formData.get('username') as string;
		const bio = formData.get('bio') as string;
		const location = formData.get('location') as string;
		const website = formData.get('website') as string;

		// Validation
		if (!displayName || displayName.trim().length === 0) {
			return fail(400, { error: 'Display name is required' });
		}

		if (displayName.length > 100) {
			return fail(400, { error: 'Display name is too long (max 100 characters)' });
		}

		if (username && username.length > 50) {
			return fail(400, { error: 'Username is too long (max 50 characters)' });
		}

		if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) {
			return fail(400, { error: 'Username can only contain letters, numbers, underscores, and hyphens' });
		}

		if (bio && bio.length > 500) {
			return fail(400, { error: 'Bio is too long (max 500 characters)' });
		}

		if (location && location.length > 100) {
			return fail(400, { error: 'Location is too long (max 100 characters)' });
		}

		if (website && website.length > 200) {
			return fail(400, { error: 'Website URL is too long (max 200 characters)' });
		}

		// Check if username is already taken
		if (username && username !== locals.user.username) {
			const db = new Database(platform.env.DB);
			const existingUser = await db.getUserByUsername(username);
			if (existingUser && existingUser.id !== locals.user.id) {
				return fail(400, { error: 'Username is already taken' });
			}
		}

		try {
			const db = new Database(platform.env.DB);
			await db.updateUser(locals.user.id, {
				display_name: displayName.trim(),
				username: username?.trim() || null,
				bio: bio?.trim() || null,
				location: location?.trim() || null,
				website: website?.trim() || null
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating profile:', err);
			return fail(500, { error: 'Failed to update profile' });
		}
	},

	uploadProfilePicture: async ({ request, platform, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		if (!platform?.env?.DB || !platform?.env?.IMAGES) {
			throw error(500, 'Platform not available');
		}

		const formData = await request.formData();
		const image = formData.get('profile_picture') as File;

		if (!image || image.size === 0) {
			return fail(400, { error: 'No image provided' });
		}

		if (image.size > 5 * 1024 * 1024) {
			return fail(400, { error: 'Image is too large (max 5MB)' });
		}

		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
		if (!allowedTypes.includes(image.type)) {
			return fail(400, { error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP' });
		}

		try {
			const imageId = crypto.randomUUID();
			const extension = image.name.split('.').pop() || 'jpg';
			const key = `profiles/${locals.user.id}/profile-${imageId}.${extension}`;

			// Upload to R2
			await platform.env.IMAGES.put(key, image.stream(), {
				httpMetadata: {
					contentType: image.type
				}
			});

			const imageUrl = `/api/images/${key}`;

			// Update user in database
			const db = new Database(platform.env.DB);
			await db.updateUser(locals.user.id, {
				profile_picture_url: imageUrl
			});

			return { success: true, profile_picture_url: imageUrl };
		} catch (err) {
			console.error('Error uploading profile picture:', err);
			return fail(500, { error: 'Failed to upload image' });
		}
	},

	uploadCoverImage: async ({ request, platform, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		if (!platform?.env?.DB || !platform?.env?.IMAGES) {
			throw error(500, 'Platform not available');
		}

		const formData = await request.formData();
		const image = formData.get('cover_image') as File;

		if (!image || image.size === 0) {
			return fail(400, { error: 'No image provided' });
		}

		if (image.size > 10 * 1024 * 1024) {
			return fail(400, { error: 'Image is too large (max 10MB)' });
		}

		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
		if (!allowedTypes.includes(image.type)) {
			return fail(400, { error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP' });
		}

		try {
			const imageId = crypto.randomUUID();
			const extension = image.name.split('.').pop() || 'jpg';
			const key = `profiles/${locals.user.id}/cover-${imageId}.${extension}`;

			// Upload to R2
			await platform.env.IMAGES.put(key, image.stream(), {
				httpMetadata: {
					contentType: image.type
				}
			});

			const imageUrl = `/api/images/${key}`;

			// Update user in database
			const db = new Database(platform.env.DB);
			await db.updateUser(locals.user.id, {
				cover_image_url: imageUrl
			});

			return { success: true, cover_image_url: imageUrl };
		} catch (err) {
			console.error('Error uploading cover image:', err);
			return fail(500, { error: 'Failed to upload image' });
		}
	}
};

