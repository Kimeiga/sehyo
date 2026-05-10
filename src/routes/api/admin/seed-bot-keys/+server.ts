import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * One-shot admin endpoint: generate an RSA-OAEP public key for every
 * seed bot that doesn't already have one, so users can actually
 * /messages a bot without hitting "Recipient has not set up
 * encryption". The matching private key is intentionally discarded —
 * bots aren't going to read the message anyway. The cipher_text just
 * sits in the messages table.
 *
 * Idempotent: bots with a public_key already are skipped.
 *
 * POST /api/admin/seed-bot-keys
 *   Header: x-admin-secret: $ADMIN_SECRET
 *   Returns: { generated: number, skipped: number }
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env || !env.ADMIN_SECRET || request.headers.get('x-admin-secret') !== env.ADMIN_SECRET) {
		throw error(401, 'Unauthorized');
	}
	if (!env.DB) throw error(500, 'Database not available');

	const bots = await env.DB.prepare(
		`SELECT id FROM user
		 WHERE bot_id LIKE 'seed_%'
		   AND (public_key IS NULL OR public_key = '')`
	)
		.all<{ id: string }>();

	let generated = 0;
	for (const bot of bots.results ?? []) {
		try {
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
			const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
			const pem = pemEncode(spki, 'PUBLIC KEY');
			await env.DB.prepare(
				`UPDATE user SET public_key = ?, updatedAt = unixepoch() WHERE id = ?`
			)
				.bind(pem, bot.id)
				.run();
			generated++;
		} catch (err) {
			console.error('Bot key generation failed for', bot.id, err);
		}
	}

	return json({
		generated,
		skipped: (bots.results?.length ?? 0) - generated
	});
};

function pemEncode(buffer: ArrayBuffer, label: string): string {
	const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
	const lines = b64.match(/.{1,64}/g) ?? [];
	return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}
