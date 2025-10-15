import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Better Auth User Table
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
	name: text('name'),
	image: text('image'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	// Additional fields for our app
	username: text('username').unique(),
	bio: text('bio'),
	location: text('location'),
	website: text('website'),
	cover_image_url: text('cover_image_url'),
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
	expiresAt: integer('expiresAt', { mode: 'timestamp' }),
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

