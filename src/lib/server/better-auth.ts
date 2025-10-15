import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './db/schema';

export function createAuth(db: D1Database, env: {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_REDIRECT_URI: string;
}) {
	// Log environment variables for debugging (remove in production)
	console.log('Better Auth Config:', {
		hasClientId: !!env.GOOGLE_CLIENT_ID,
		hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
		hasRedirectUri: !!env.GOOGLE_REDIRECT_URI,
		clientIdPrefix: env.GOOGLE_CLIENT_ID?.substring(0, 20),
		redirectUri: env.GOOGLE_REDIRECT_URI
	});

	// Create Drizzle instance with D1
	const drizzleDb = drizzle(db, { schema });

	try {
		return betterAuth({
			database: drizzleAdapter(drizzleDb, {
				provider: 'sqlite', // D1 is SQLite-compatible
			}),

		// Base URL for callbacks
		baseURL: env.GOOGLE_REDIRECT_URI?.replace('/api/auth/callback/google', '') || 'https://fb-portfolio-1ae.pages.dev',
		
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
		},

		// Plugins
		plugins: [
			anonymous()
		]
	});
	} catch (error) {
		console.error('Error creating Better Auth instance:', error);
		throw error;
	}
}

// Type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

