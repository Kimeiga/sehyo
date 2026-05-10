import type { D1Database } from '@cloudflare/workers-types';

/**
 * Usernames that can never be claimed because they collide with app
 * routes, system identities, or are too generic. Compared lowercase.
 */
export const RESERVED_USERNAMES = new Set<string>([
	// Top-level app routes
	'search', 'history', 'messages', 'friends', 'profile', 'settings', 'admin',
	'auth', 'login', 'signup', 'signin', 'signout', 'logout', 'register',
	'account', 'home', 'feed', 'world',
	'post', 'comment', 'posts', 'comments',
	// API + static
	'api', 'og', 'sw', 'robots', 'sitemap', 'favicon', 'manifest',
	'static', 'assets', 'public', 'pwa', 'sehyo', 'logo',
	// Reserved identities
	'sehyobot', 'official', 'support', 'help', 'mod', 'admin', 'staff', 'team',
	'system', 'bot', 'ai', 'me', 'you', 'self', 'anonymous', 'guest',
	// Boilerplate
	'about', 'contact', 'privacy', 'terms', 'tos', 'eula',
	// Truthy / falsy traps
	'null', 'undefined', 'nil', 'none', 'true', 'false', 'void'
]);

const VALID_RE = /^[a-z0-9_]{2,20}$/;

/**
 * Normalize a free-form name into a candidate username slug.
 * Lowercase, ASCII alphanum + underscore, 2–20 chars. Returns ''
 * if nothing usable remains after filtering.
 */
export function normalizeUsername(input: string): string {
	const stripped = input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9_]+/g, '')
		.slice(0, 20);
	return stripped.length >= 2 ? stripped : '';
}

export function validateUsername(username: string): { ok: true } | { ok: false; reason: string } {
	if (!username) return { ok: false, reason: 'Username is required.' };
	if (!VALID_RE.test(username)) {
		return { ok: false, reason: 'Use 2–20 lowercase letters, numbers, or underscores.' };
	}
	if (RESERVED_USERNAMES.has(username)) {
		return { ok: false, reason: 'That username is reserved.' };
	}
	return { ok: true };
}

/**
 * Generate a unique username. Starts from the slugified display name
 * (e.g. "Quiet River" -> "quietriver"), and appends a number if it
 * collides until a free slot is found. Falls back to a random
 * suffix in the unlikely case of high contention.
 */
export async function generateUniqueUsername(
	db: D1Database,
	displayName: string | null | undefined,
	excludeUserId?: string
): Promise<string> {
	let base = normalizeUsername(displayName ?? '');
	if (!base) base = 'user';

	const tryCandidate = async (cand: string) => {
		if (RESERVED_USERNAMES.has(cand)) return false;
		if (!VALID_RE.test(cand)) return false;
		const row = excludeUserId
			? await db
					.prepare('SELECT id FROM user WHERE username = ? AND id <> ?')
					.bind(cand, excludeUserId)
					.first()
			: await db.prepare('SELECT id FROM user WHERE username = ?').bind(cand).first();
		return !row;
	};

	if (await tryCandidate(base)) return base;
	for (let i = 1; i < 1000; i++) {
		const cand = `${base}${i}`.slice(0, 20);
		if (await tryCandidate(cand)) return cand;
	}
	// Fallback random suffix.
	const random = Math.random().toString(36).slice(2, 8);
	return `${base.slice(0, 14)}_${random}`;
}
