import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './db/schema';

// Cache for auth instances - use a Map with baseURL as key
const authCache = new Map<string, ReturnType<typeof betterAuth>>();

export function createAuth(db: D1Database, env: {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_REDIRECT_URI?: string;
}, baseURL?: string) {
	// Determine the base URL
	const effectiveBaseURL = baseURL || env.GOOGLE_REDIRECT_URI?.replace('/api/auth/callback/google', '') || 'https://fb-portfolio-1ae.pages.dev';

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
			'https://fb-portfolio-1ae.pages.dev'
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
			anonymous()
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

