# Authentication Migration Guide: Better Auth + Drizzle + Cloudflare D1

This document details the complete migration from a custom authentication system to Better Auth, including all issues encountered and their solutions.

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Migration Steps](#migration-steps)
4. [Critical Issues & Solutions](#critical-issues--solutions)
5. [Database Schema](#database-schema)
6. [Code Examples](#code-examples)
7. [Pitfalls & Lessons Learned](#pitfalls--lessons-learned)

---

## Overview

### What We Migrated From
- Custom authentication system with manual session management
- Separate `users` table for application data
- Manual Google OAuth implementation

### What We Migrated To
- **Better Auth**: Modern authentication library with plugin system
- **Drizzle ORM**: TypeScript ORM for database operations
- **Cloudflare D1**: SQLite-based serverless database
- Consolidated `user` table managed by Better Auth

### Key Features Implemented
- ✅ Google OAuth login
- ✅ Anonymous/guest login (24-hour expiry)
- ✅ Dynamic redirect URIs (works on any localhost port)
- ✅ Singleton auth instance pattern
- ✅ Consolidated user table (eliminated duplication)

---

## Technology Stack

### Core Dependencies
```json
{
  "better-auth": "^1.1.4",
  "drizzle-orm": "^0.38.3",
  "@better-auth/anonymous": "^1.1.4"
}
```

### Why Drizzle (Not Kysely)?
**CRITICAL:** The Kysely D1 adapter is **NOT compatible** with Better Auth on Cloudflare D1.
- Kysely adapter causes "Failed to initialize database adapter" errors
- Drizzle is the only proven working adapter for Better Auth + D1
- Migration from Kysely to Drizzle was necessary

---

## Migration Steps

### Step 1: Install Dependencies
```bash
npm install better-auth drizzle-orm @better-auth/anonymous
npm install -D drizzle-kit
```

### Step 2: Create Drizzle Schema
File: `src/lib/server/db/schema.ts`

**IMPORTANT:** Better Auth uses **camelCase** column names, not snake_case:
- `name` (not `display_name`)
- `image` (not `profile_picture_url`)
- `createdAt` (not `created_at`)
- `updatedAt` (not `updated_at`)

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
	name: text('name'),
	image: text('image'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	// Custom fields
	google_id: text('google_id').unique(),
	username: text('username').unique(),
	bio: text('bio'),
	location: text('location'),
	website: text('website'),
	cover_image_url: text('cover_image_url'),
	public_key: text('public_key'),
	isAnonymous: integer('isAnonymous', { mode: 'boolean' }).default(false)
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull()
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull()
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull()
});
```

### Step 3: Configure Better Auth Server
File: `src/lib/server/better-auth.ts`

**CRITICAL PATTERN:** Use singleton pattern with caching by baseURL to avoid creating multiple instances.

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
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

	// Construct redirect URI dynamically
	const redirectURI = env.GOOGLE_REDIRECT_URI || `${effectiveBaseURL}/api/auth/callback/google`;

	// Create Drizzle instance
	const drizzleDb = drizzle(db, { schema });

	const auth = betterAuth({
		database: drizzleAdapter(drizzleDb, {
			provider: 'sqlite'
		}),
		baseURL: effectiveBaseURL,
		trustedOrigins: [
			'http://localhost:5173',
			'http://localhost:5174',
			'http://localhost:5175',
			'http://localhost:5176',
			'https://fb-portfolio-1ae.pages.dev'
		],
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
				redirectURI: redirectURI
			}
		},
		plugins: [
			anonymous({
				expiresIn: 60 * 60 * 24 // 24 hours
			})
		]
	});

	// Cache the instance by baseURL
	authCache.set(effectiveBaseURL, auth);
	return auth;
}
```

### Step 4: Configure Better Auth Client
File: `src/lib/auth-client.ts`

```typescript
import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/plugins';

export const authClient = createAuthClient({
	baseURL: typeof window !== 'undefined' ? window.location.origin : '',
	plugins: [anonymousClient()]
});
```

### Step 5: Setup Auth Handler
File: `src/routes/api/auth/[...all]/+server.ts`

**IMPORTANT:** Extract baseURL from request and pass to createAuth.

```typescript
import type { RequestHandler } from './$types';
import { createAuth } from '$lib/server/better-auth';

export const GET: RequestHandler = async ({ request, platform }) => {
	const url = new URL(request.url);
	const baseURL = `${url.protocol}//${url.host}`;
	
	const auth = createAuth(platform.env.DB, {
		GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
	}, baseURL);

	return await auth.handler(request);
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const url = new URL(request.url);
	const baseURL = `${url.protocol}//${url.host}`;
	
	const auth = createAuth(platform.env.DB, {
		GOOGLE_CLIENT_ID: platform.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: platform.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI: platform.env.GOOGLE_REDIRECT_URI
	}, baseURL);

	return await auth.handler(request);
};
```

### Step 6: Setup SvelteKit Hooks
File: `src/hooks.server.ts`

```typescript
import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$lib/server/better-auth';

export const handle: Handle = async ({ event, resolve }) => {
	if (!event.platform?.env?.DB) {
		return await resolve(event);
	}

	try {
		// Get base URL from request
		const url = new URL(event.request.url);
		const baseURL = `${url.protocol}//${url.host}`;
		
		// Create Better Auth instance
		const auth = createAuth(event.platform.env.DB, {
			GOOGLE_CLIENT_ID: event.platform.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: event.platform.env.GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI: event.platform.env.GOOGLE_REDIRECT_URI
		}, baseURL);

		// Get session from Better Auth
		const session = await auth.api.getSession({ headers: event.request.headers });

		// Set user and session in locals
		event.locals.user = session?.user ?? null;
		event.locals.session = session?.session ?? null;
	} catch (error) {
		console.error('Auth error in hooks:', error);
		event.locals.user = null;
		event.locals.session = null;
	}

	return await resolve(event);
};
```

---

## Critical Issues & Solutions

### Issue 1: "Failed to initialize database adapter"
**Symptom:** 500 error when trying to use Better Auth
**Root Cause:** Kysely D1 adapter is incompatible with Better Auth
**Solution:** Migrate to Drizzle ORM
**Files Changed:** All database query files

### Issue 2: "Invalid Origin" Error
**Symptom:** CORS error during authentication
**Root Cause:** Missing `trustedOrigins` configuration
**Solution:** Add all localhost ports and production URL to `trustedOrigins` array

### Issue 3: "State Mismatch. Verification not found"
**Symptom:** OAuth callback fails with state mismatch error
**Root Cause 1:** Duplicate `better_auth_*` tables causing Better Auth to write to one set and read from another
**Solution 1:** Drop old `better_auth_*` tables (Migration 0010)

**Root Cause 2:** Custom `/auth/login/google` route bypassed Better Auth's OAuth state management
**Solution 2:** Use Better Auth's client-side `signIn.social()` method instead

```typescript
// WRONG - Custom route bypasses Better Auth
<a href="/auth/login/google">Continue with Google</a>

// CORRECT - Use Better Auth client
<button onclick={() => authClient.signIn.social({ provider: 'google', callbackURL: '/' })}>
	Continue with Google
</button>
```

### Issue 4: "accessTokenExpiresAt does not exist"
**Symptom:** OAuth fails with missing field error
**Root Cause:** Account table missing required OAuth token fields
**Solution:** Add `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope` fields (Migration 0012)

### Issue 5: Duplicate User Tables
**Symptom:** Data duplication between `user` and `users` tables
**Root Cause:** Maintained separate tables for Better Auth and application
**Solution:** Consolidate into single `user` table (Migration 0011)

### Issue 6: Port Mismatch in Redirect URI
**Symptom:** OAuth fails when dev server changes ports
**Root Cause:** Hardcoded port in `GOOGLE_REDIRECT_URI` environment variable
**Solution:** Make redirect URI dynamic based on request origin

```typescript
// Extract base URL from request
const url = new URL(request.url);
const baseURL = `${url.protocol}//${url.host}`;

// Pass to createAuth
const auth = createAuth(db, env, baseURL);
```

### Issue 7: Multiple Auth Instances
**Symptom:** Inconsistent behavior, potential memory leaks
**Root Cause:** Creating new Better Auth instance on every request
**Solution:** Implement singleton pattern with Map cache keyed by baseURL

---

## Database Schema

### Migrations Applied

#### Migration 0010: Drop Old Better Auth Tables
```sql
DROP TABLE IF EXISTS better_auth_user;
DROP TABLE IF EXISTS better_auth_session;
DROP TABLE IF EXISTS better_auth_account;
DROP TABLE IF EXISTS better_auth_verification;
```

#### Migration 0011: Consolidate User Tables
```sql
-- Add Better Auth fields to user table
ALTER TABLE user ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE user ADD COLUMN public_key TEXT;

-- Migrate data from users to user (if needed)
-- ...

-- Drop old users table
DROP TABLE IF EXISTS users;
```

#### Migration 0012: Add Token Expiry Fields
```sql
ALTER TABLE account ADD COLUMN accessTokenExpiresAt INTEGER;
ALTER TABLE account ADD COLUMN refreshTokenExpiresAt INTEGER;
ALTER TABLE account ADD COLUMN scope TEXT;
```

---

## Code Examples

### Login Page with Google OAuth
```svelte
<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { onMount } from 'svelte';

	let loading = $state(false);
	let googleButtonRef: HTMLButtonElement;

	onMount(() => {
		if (googleButtonRef) {
			googleButtonRef.addEventListener('click', async (e) => {
				e.preventDefault();
				try {
					loading = true;
					await authClient.signIn.social({
						provider: 'google',
						callbackURL: '/'
					});
				} catch (error) {
					console.error('Google login error:', error);
					loading = false;
				}
			});
		}
	});
</script>

<button bind:this={googleButtonRef} disabled={loading}>
	{loading ? 'Signing in...' : 'Continue with Google'}
</button>
```

### Anonymous Login
```typescript
await authClient.signIn.anonymous({
	fetchOptions: {
		onSuccess: () => {
			window.location.href = '/';
		},
		onError: (ctx) => {
			console.error('Anonymous login error:', ctx.error);
		}
	}
});
```

### Mapping Better Auth User to Display Format
```typescript
// Better Auth uses: name, image, createdAt
// UI expects: display_name, profile_picture_url, created_at

const profileUser = {
	id: user.id,
	display_name: user.name || user.email || 'Anonymous User',
	profile_picture_url: user.image,
	username: user.username,
	bio: user.bio,
	created_at: user.createdAt 
		? (typeof user.createdAt === 'number' 
			? user.createdAt 
			: Math.floor(new Date(user.createdAt).getTime() / 1000))
		: null
};
```

---

## Pitfalls & Lessons Learned

### 1. ORM Compatibility
**Lesson:** Not all ORMs work with Better Auth on Cloudflare D1
- Kysely: ❌ Does NOT work
- Drizzle: ✅ Works perfectly
- Always check Better Auth documentation for supported adapters

### 2. Column Naming Conventions
**Lesson:** Better Auth uses camelCase, not snake_case
- Must use `name`, `image`, `createdAt`, `updatedAt`
- Cannot use `display_name`, `profile_picture_url`, `created_at`, `updated_at`
- Need mapping layer if UI expects different names

### 3. OAuth State Management
**Lesson:** Never bypass Better Auth's OAuth flow
- Don't create custom OAuth routes
- Always use Better Auth's client methods
- State tokens are managed internally in `verification` table

### 4. Singleton Pattern is Critical
**Lesson:** Creating new auth instances on every request causes issues
- Use Map cache with baseURL as key
- Prevents memory leaks
- Ensures consistent behavior

### 5. Dynamic URLs for Development
**Lesson:** Hardcoded ports break when dev server changes ports
- Extract baseURL from request
- Pass to createAuth function
- Works on any localhost port

### 6. Table Consolidation
**Lesson:** Don't maintain duplicate user tables
- Better Auth manages the `user` table
- Add custom fields directly to Better Auth's `user` table
- Eliminates sync logic and data duplication

### 7. Google OAuth Console Setup
**Lesson:** Add multiple redirect URIs for development
- Add ports 5173-5178 for Vite dev server
- Format: `http://localhost:PORT/api/auth/callback/google`
- Production: `https://your-domain.com/api/auth/callback/google`

### 8. Environment Variables
**Lesson:** Leave `GOOGLE_REDIRECT_URI` empty for dynamic URLs
```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=  # Leave empty for dynamic URL
```

### 9. TypeScript Types
**Lesson:** Update User interface to match Better Auth schema
```typescript
export interface User {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string | null;  // Not display_name
	image: string | null;  // Not profile_picture_url
	createdAt: Date | number;  // Not created_at
	updatedAt: Date | number;  // Not updated_at
	// Custom fields
	google_id: string | null;
	username: string | null;
	bio: string | null;
	// ...
}
```

### 10. Migration Order Matters
**Lesson:** Apply migrations in correct order
1. Drop duplicate tables first (0010)
2. Consolidate user tables (0011)
3. Add missing fields (0012)
4. Update code to use new schema

---

## Testing Checklist

- [ ] Google OAuth login works
- [ ] Anonymous login works
- [ ] Session persists across page refreshes
- [ ] Profile page shows Google name and picture
- [ ] Works on different localhost ports
- [ ] Production deployment works
- [ ] Anonymous sessions expire after 24 hours
- [ ] User data properly stored in database

---

## Environment Setup

### Local Development (.dev.vars)
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=  # Leave empty for dynamic URL
```

### Production (Cloudflare Pages)
Set environment variables in Cloudflare dashboard:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (optional, leave empty for dynamic)

---

## Summary

This migration successfully implemented Better Auth with Google OAuth and anonymous login on Cloudflare D1 using Drizzle ORM. The key to success was:

1. Using Drizzle (not Kysely) as the ORM
2. Following Better Auth's camelCase naming conventions
3. Implementing singleton pattern for auth instances
4. Using Better Auth's client methods (not custom routes)
5. Consolidating into a single user table
6. Making redirect URIs dynamic for development flexibility

The system now supports both authenticated Google users and anonymous guests with a clean, maintainable codebase.

