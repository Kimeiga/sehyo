import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Generate encryption keys for a user
 * 
 * This endpoint generates RSA-OAEP key pairs for E2E encryption.
 * It's primarily used for anonymous users who need encryption keys
 * to use the messaging feature.
 * 
 * POST /api/user/generate-keys
 * Returns: { public_key: string, private_key: string }
 */
export const POST: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		// Generate RSA-OAEP key pair
		const keyPair = await crypto.subtle.generateKey(
			{
				name: 'RSA-OAEP',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['encrypt', 'decrypt']
		);

		// Export keys
		const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
		const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

		// Convert to PEM format
		const publicKeyPem = pemEncode(publicKey, 'PUBLIC KEY');
		const privateKeyPem = pemEncode(privateKey, 'PRIVATE KEY');

		// Save public key to database
		await db
			.prepare(`UPDATE user SET public_key = ?, updatedAt = unixepoch() WHERE id = ?`)
			.bind(publicKeyPem, locals.user.id)
			.run();

		return json({
			success: true,
			public_key: publicKeyPem,
			private_key: privateKeyPem
		});
	} catch (err) {
		console.error('Generate keys error:', err);
		throw error(500, 'Failed to generate encryption keys');
	}
};

/**
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Encode key in PEM format
 */
function pemEncode(buffer: ArrayBuffer, label: string): string {
	const base64 = arrayBufferToBase64(buffer);
	const lines = base64.match(/.{1,64}/g) || [];
	return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

