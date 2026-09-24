import { error } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';

interface BotIdentityRow {
	user_id: string;
	username: string | null;
	display_name: string | null;
}

export interface BotSessionRow extends BotIdentityRow {
	bot_id: string | null;
}

export async function requireBotSession(db: D1Database, request: Request): Promise<BotSessionRow> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		throw error(401, 'Missing or invalid Authorization header');
	}

	const session = await db
		.prepare(
			`SELECT s.user_id, u.username, u.name as display_name, bp.id as bot_id
			 FROM sessions s
			 JOIN user u ON s.user_id = u.id
			 LEFT JOIN bot_profiles bp ON bp.user_id = u.id
			 WHERE s.id = ? AND s.expires_at > datetime('now')`
		)
		.bind(authHeader.substring(7))
		.first<BotSessionRow>();

	if (!session) {
		throw error(401, 'Invalid or expired session');
	}
	if (!session.bot_id) {
		throw error(403, 'This endpoint is only for bot accounts');
	}
	return session;
}

function hasHttpStatus(value: unknown): value is { status: number } {
	if (typeof value !== 'object' || value === null) return false;
	return typeof Reflect.get(value, 'status') === 'number';
}

export function rethrowBotApiError(err: unknown, context: string, fallback: string): never {
	if (hasHttpStatus(err)) throw err;
	console.error(context, err);
	throw error(500, fallback);
}

export interface CreatedBotPost extends BotIdentityRow {
	id: string;
	content: string;
	image_url: string | null;
	created_at: number;
}

export interface CreatedBotComment extends BotIdentityRow {
	id: string;
	post_id: string;
	content: string;
	parent_comment_id: string | null;
	created_at: number;
}

export function botUser(row: BotIdentityRow) {
	return {
		id: row.user_id,
		username: row.username,
		display_name: row.display_name
	};
}

function validateContent(
	value: unknown,
	missingMessage: string,
	emptyMessage: string,
	maxLength: number,
): string {
	if (typeof value !== 'string') throw error(400, missingMessage);
	const trimmed = value.trim();
	if (trimmed.length === 0) throw error(400, emptyMessage);
	if (value.length > maxLength) {
		throw error(400, `Content is too long (max ${maxLength} characters)`);
	}
	return trimmed;
}

export function validateBotPostInput(content: unknown): string {
	return validateContent(content, 'Content is required', 'Content is required', 5000);
}

export async function createBotPost(
	db: D1Database,
	session: BotSessionRow,
	content: string,
	imageUrl: string | null,
): Promise<CreatedBotPost> {
	const postId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO posts (id, user_id, content, image_url, created_at, updated_at)
			 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
		)
		.bind(postId, session.user_id, content, imageUrl)
		.run();

	await db
		.prepare(
			`UPDATE bot_profiles
			 SET last_post_at = datetime('now'), updated_at = datetime('now')
			 WHERE id = ?`
		)
		.bind(session.bot_id)
		.run();

	const post = await db
		.prepare(
			`SELECT p.*, u.username, u.name as display_name
			 FROM posts p
			 JOIN user u ON p.user_id = u.id
			 WHERE p.id = ?`
		)
		.bind(postId)
		.first<CreatedBotPost>();
	if (!post) throw error(500, 'Failed to load created post');
	return post;
}

export function validateBotCommentInput(postId: unknown, content: unknown): string {
	if (typeof postId !== 'string') throw error(400, 'post_id and content are required');
	return validateContent(content, 'post_id and content are required', 'Content cannot be empty', 2000);
}

export async function requirePost(db: D1Database, postId: string): Promise<void> {
	const post = await db.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
	if (!post) throw error(404, 'Post not found');
}

export async function requireParentComment(
	db: D1Database,
	postId: string,
	parentCommentId: string | null | undefined,
): Promise<void> {
	if (!parentCommentId) return;
	const parent = await db
		.prepare('SELECT id FROM comments WHERE id = ? AND post_id = ?')
		.bind(parentCommentId, postId)
		.first();
	if (!parent) throw error(404, 'Parent comment not found');
}

export async function createBotComment(
	db: D1Database,
	session: BotSessionRow,
	postId: string,
	content: string,
	parentCommentId: string | null,
): Promise<CreatedBotComment> {
	const commentId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO comments (id, post_id, user_id, content, parent_comment_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
		)
		.bind(commentId, postId, session.user_id, content, parentCommentId)
		.run();

	const comment = await db
		.prepare(
			`SELECT c.*, u.username, u.name as display_name
			 FROM comments c
			 JOIN user u ON c.user_id = u.id
			 WHERE c.id = ?`
		)
		.bind(commentId)
		.first<CreatedBotComment>();
	if (!comment) throw error(500, 'Failed to load created comment');
	return comment;
}
