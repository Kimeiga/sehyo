import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Better Auth User Table (consolidated - replaces both user and users tables)
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
	name: text('name'), // Display name (maps to display_name in old users table)
	image: text('image'), // Profile picture URL (maps to profile_picture_url in old users table)
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	// Additional fields for our app
	bot_id: text('bot_id').unique(), // Bot identifier (for bot users only)
	username: text('username').unique(),
	bio: text('bio'),
	location: text('location'),
	website: text('website'),
	cover_image_url: text('cover_image_url'),
	public_key: text('public_key'), // For E2E encryption
	sprite_id: integer('sprite_id'), // Sprite avatar ID (1-125)
	// Anonymous user support
	isAnonymous: integer('isAnonymous', { mode: 'boolean' }).default(false)
});

// Better Auth Session Table
export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	token: text('token').unique(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull()
});

// Better Auth Account Table (for OAuth providers)
export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
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

// Better Auth Verification Table
export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull()
});

// Daily prompts. `active_date` is "YYYY-MM-DD" UTC. Multiple rows per
// `active_date` are allowed — consumers that want "today's prompt" must
// order by `created_at DESC` and pick the latest.
// `created_at` is unix-seconds; SQLite's `unixepoch()` fills it on insert.
export const dailyPrompts = sqliteTable('daily_prompts', {
	id: text('id').primaryKey(),
	prompt_text: text('prompt_text').notNull(),
	active_date: text('active_date').notNull(),
	created_at: integer('created_at')
		.notNull()
		.default(sql`(unixepoch())`)
});

// Posts. May or may not be attached to a prompt (`prompt_id` null for
// free-form posts, set for daily-prompt answers).
export const posts = sqliteTable('posts', {
	id: text('id').primaryKey(),
	user_id: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	prompt_id: text('prompt_id').references(() => dailyPrompts.id, { onDelete: 'set null' }),
	content: text('content').notNull(),
	image_url: text('image_url'),
	created_at: integer('created_at')
		.notNull()
		.default(sql`(unixepoch())`),
	updated_at: integer('updated_at')
		.notNull()
		.default(sql`(unixepoch())`)
});

// Comments. Self-referential via parent_comment_id for threaded replies.
// The DB enforces an FK back to comments(id); Drizzle skips modelling that
// self-reference here to keep the schema simple — the runtime queries don't
// need it.
export const comments = sqliteTable('comments', {
	id: text('id').primaryKey(),
	post_id: text('post_id')
		.notNull()
		.references(() => posts.id, { onDelete: 'cascade' }),
	user_id: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	parent_comment_id: text('parent_comment_id'),
	content: text('content').notNull(),
	created_at: integer('created_at')
		.notNull()
		.default(sql`(unixepoch())`),
	updated_at: integer('updated_at')
		.notNull()
		.default(sql`(unixepoch())`)
});

// Bot personalities. One row per bot user. `personality` is LLM-only
// guidance; not exposed to humans (the public-facing bio lives on `user`).
export const botProfiles = sqliteTable('bot_profiles', {
	id: text('id').primaryKey(),
	user_id: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	personality: text('personality').notNull(),
	posting_frequency: text('posting_frequency').notNull().default('daily'),
	last_post_at: text('last_post_at'),
	is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	created_at: text('created_at'),
	updated_at: text('updated_at')
});

