import { betterAuth } from 'better-auth';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { D1Database } from '@cloudflare/workers-types';

export function createAuth(db: D1Database, env: {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_REDIRECT_URI: string;
}) {
	// Create Kysely instance with D1
	const kysely = new Kysely({
		dialect: new D1Dialect({ database: db })
	});

	return betterAuth({
		database: kysely,
		
		// Base URL for callbacks
		baseURL: env.GOOGLE_REDIRECT_URI.replace('/auth/callback', ''),
		
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
				redirectURI: env.GOOGLE_REDIRECT_URI
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
				}
			}
		},
		
		// Advanced options
		advanced: {
			cookiePrefix: 'better-auth',
			crossSubDomainCookies: {
				enabled: false
			}
		}
	});
}

// Type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

