import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './db/schema';
import { generateRandomName } from './random-name';

// Cache for auth instances - use a Map with baseURL as key
const authCache = new Map<string, ReturnType<typeof betterAuth>>();

export function createAuth(db: D1Database, env: {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_REDIRECT_URI?: string;
	BETTER_AUTH_SECRET?: string;
}, baseURL?: string) {
	// Determine the base URL
	const effectiveBaseURL = baseURL || env.GOOGLE_REDIRECT_URI?.replace('/api/auth/callback/google', '') || 'https://sehyo.com';

	// Return cached instance if it exists for this baseURL
	const cached = authCache.get(effectiveBaseURL);
	if (cached) {
		return cached;
	}

	// Construct redirect URI
	const redirectURI = env.GOOGLE_REDIRECT_URI || `${effectiveBaseURL}/api/auth/callback/google`;

	// Log environment variables for debugging (remove in production)
	console.log('Creating new Better Auth instance:', {
		hasClientId: !!env.GOOGLE_CLIENT_ID,
		hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
		baseURL: effectiveBaseURL,
		redirectURI: redirectURI,
		clientIdPrefix: env.GOOGLE_CLIENT_ID?.substring(0, 20)
	});

	// Create Drizzle instance with D1
	const drizzleDb = drizzle(db, { schema });

	try {
		const auth = betterAuth({
			database: drizzleAdapter(drizzleDb, {
				provider: 'sqlite', // D1 is SQLite-compatible
			}),

		// HMAC secret for session tokens. Cloudflare Workers don't
		// expose process.env, so better-auth can't auto-pick it up
		// from the environment the way it does on Node — we pass it
		// explicitly. Without this, recent better-auth versions
		// throw "You are using the default secret" and 500 every
		// /api/auth/* call.
		secret: env.BETTER_AUTH_SECRET,

		// Base URL for callbacks
		baseURL: effectiveBaseURL,

		// Trusted origins for CORS (allow localhost for development)
		trustedOrigins: [
			'http://localhost:5173',
			'http://localhost:5174',
			'http://localhost:5175',
			'http://localhost:5176',
			'http://localhost:5177',
			'http://localhost:5178',
			'https://sehyo.com',
			'https://www.sehyo.com',
			'https://sehyo.pages.dev'
		],
		
		// Email and password authentication
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false, // We'll enable this later with email service
			minPasswordLength: 8,
			maxPasswordLength: 128
		},
		
		// Social providers
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
				redirectURI: redirectURI
			}
		},
		
		// Session configuration
		session: {
			expiresIn: 60 * 60 * 24 * 30, // 30 days
			updateAge: 60 * 60 * 24, // Update session every 24 hours
			cookieCache: {
				enabled: true,
				maxAge: 60 * 5 // Cache for 5 minutes
			}
		},
		
		// User configuration
		user: {
			additionalFields: {
				// Map our custom user fields
				username: {
					type: 'string',
					required: false,
					unique: true
				},
				bio: {
					type: 'string',
					required: false
				},
				location: {
					type: 'string',
					required: false
				},
				website: {
					type: 'string',
					required: false
				},
				cover_image_url: {
					type: 'string',
					required: false
				},
				sprite_id: {
					type: 'number',
					required: false,
					defaultValue: () => Math.floor(Math.random() * 125) + 1 // Random sprite 1-125
				}
			}
		},
		
		// Advanced options
		advanced: {
			cookiePrefix: 'better-auth',
			crossSubDomainCookies: {
				enabled: false
			}
		},

		// Plugins
		plugins: [
			anonymous({
				generateName: () => generateRandomName(),
				// When an anon user links to Google (or any social), migrate
				// their content to the new account before the anon row is
				// deleted. Without this, the FK CASCADE wipes out their
				// posts and comments — which is the bug the user hit when
				// answering anonymously then signing in.
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					const oldId = anonymousUser.user.id;
					const newId = newUser.user.id;
					if (oldId === newId) return;
					try {
						await db
							.prepare('UPDATE posts SET user_id = ? WHERE user_id = ?')
							.bind(newId, oldId)
							.run();
						await db
							.prepare('UPDATE comments SET user_id = ? WHERE user_id = ?')
							.bind(newId, oldId)
							.run();
						await db
							.prepare('UPDATE reactions SET user_id = ? WHERE user_id = ?')
							.bind(newId, oldId)
							.run();
					} catch (err) {
						console.error('onLinkAccount migration failed:', err);
					}
				}
			})
		]
	});

		// Cache the instance by baseURL
		authCache.set(effectiveBaseURL, auth);
		return auth;
	} catch (error) {
		console.error('Error creating Better Auth instance:', error);
		throw error;
	}
}

// Type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

