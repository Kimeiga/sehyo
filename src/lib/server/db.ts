import type { D1Database } from '@cloudflare/workers-types';
import type { User, Post, Comment, Reaction, Friendship, Message, Session } from '$lib/types';

export class Database {
	constructor(private db: D1Database) {}

	// User operations
	async createUser(data: {
		id: string;
		bot_id?: string; // Optional bot_id for bot users
		email: string;
		name: string;
		image?: string;
	}): Promise<User> {
		const result = await this.db
			.prepare(
				`INSERT INTO user (id, bot_id, email, name, image, createdAt, updatedAt, emailVerified)
				 VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch(), 0)
				 RETURNING *`
			)
			.bind(
				data.id,
				data.bot_id || null,
				data.email,
				data.name,
				data.image || null
			)
			.first<User>();

		if (!result) throw new Error('Failed to create user');
		return result;
	}

	async getUserById(id: string): Promise<User | null> {
		return await this.db.prepare('SELECT * FROM user WHERE id = ?').bind(id).first<User>();
	}

	async getUserByBotId(bot_id: string): Promise<User | null> {
		return await this.db
			.prepare('SELECT * FROM user WHERE bot_id = ?')
			.bind(bot_id)
			.first<User>();
	}

	async getUserByUsername(username: string): Promise<User | null> {
		return await this.db
			.prepare('SELECT * FROM user WHERE username = ?')
			.bind(username)
			.first<User>();
	}

	async updateUser(id: string, data: Partial<User>): Promise<User> {
		const fields: string[] = [];
		const values: any[] = [];

		Object.entries(data).forEach(([key, value]) => {
			if (key !== 'id' && value !== undefined) {
				fields.push(`${key} = ?`);
				values.push(value);
			}
		});

		if (fields.length === 0) {
			const user = await this.getUserById(id);
			if (!user) throw new Error('User not found');
			return user;
		}

		values.push(id);
		const result = await this.db
			.prepare(
				`UPDATE user SET ${fields.join(', ')}, updatedAt = unixepoch()
				 WHERE id = ?
				 RETURNING *`
			)
			.bind(...values)
			.first<User>();

		if (!result) throw new Error('Failed to update user');
		return result;
	}

	// Post operations
	async createPost(data: { id: string; user_id: string; content: string; image_url?: string }): Promise<Post> {
		// Insert the post
		await this.db
			.prepare(
				`INSERT INTO posts (id, user_id, content, image_url)
				 VALUES (?, ?, ?, ?)`
			)
			.bind(data.id, data.user_id, data.content, data.image_url || null)
			.run();

		// Fetch the post with user information
		const result = await this.getPostById(data.id);
		if (!result) throw new Error('Failed to create post');
		return result;
	}

	async getPostById(id: string): Promise<Post | null> {
		return await this.db
			.prepare(
				`SELECT p.*, u.id as user_id, u.name as display_name, u.username, u.image as profile_picture_url, u.sprite_id
				 FROM posts p
				 JOIN user u ON p.user_id = u.id
				 WHERE p.id = ?`
			)
			.bind(id)
			.first<Post>();
	}

	async getFeedPosts(limit: number = 20, offset: number = 0): Promise<Post[]> {
		const results = await this.db
			.prepare(
				`SELECT p.*, u.name as display_name, u.username, u.image as profile_picture_url, u.sprite_id
				 FROM posts p
				 JOIN user u ON p.user_id = u.id
				 ORDER BY p.created_at DESC
				 LIMIT ? OFFSET ?`
			)
			.bind(limit, offset)
			.all<Post>();

		return results.results || [];
	}

	async getUserPosts(user_id: string, limit: number = 20, offset: number = 0): Promise<Post[]> {
		const results = await this.db
			.prepare(
				`SELECT p.*, u.name as display_name, u.username, u.image as profile_picture_url, u.sprite_id
				 FROM posts p
				 JOIN user u ON p.user_id = u.id
				 WHERE p.user_id = ?
				 ORDER BY p.created_at DESC
				 LIMIT ? OFFSET ?`
			)
			.bind(user_id, limit, offset)
			.all<Post>();

		return results.results || [];
	}

	async deletePost(id: string, user_id: string): Promise<boolean> {
		const result = await this.db
			.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?')
			.bind(id, user_id)
			.run();

		return result.success;
	}

	// Comment operations
	async createComment(data: {
		id: string;
		post_id: string;
		user_id: string;
		content: string;
		parent_comment_id?: string;
	}): Promise<Comment> {
		const result = await this.db
			.prepare(
				`INSERT INTO comments (id, post_id, user_id, content, parent_comment_id)
				 VALUES (?, ?, ?, ?, ?)
				 RETURNING *`
			)
			.bind(data.id, data.post_id, data.user_id, data.content, data.parent_comment_id || null)
			.first<Comment>();

		if (!result) throw new Error('Failed to create comment');
		return result;
	}

	async getPostComments(post_id: string): Promise<Comment[]> {
		const results = await this.db
			.prepare(
				`SELECT c.*, u.name as display_name, u.username, u.image as profile_picture_url, u.sprite_id
				 FROM comments c
				 JOIN user u ON c.user_id = u.id
				 WHERE c.post_id = ? AND c.parent_comment_id IS NULL
				 ORDER BY c.created_at ASC`
			)
			.bind(post_id)
			.all<Comment>();

		return results.results || [];
	}

	async getCommentReplies(comment_id: string): Promise<Comment[]> {
		const results = await this.db
			.prepare(
				`SELECT c.*, u.name as display_name, u.username, u.image as profile_picture_url, u.sprite_id
				 FROM comments c
				 JOIN user u ON c.user_id = u.id
				 WHERE c.parent_comment_id = ?
				 ORDER BY c.created_at ASC`
			)
			.bind(comment_id)
			.all<Comment>();

		return results.results || [];
	}

	// Reaction operations
	async addReaction(data: {
		id: string;
		user_id: string;
		target_type: 'post' | 'comment';
		target_id: string;
		reaction_type: string;
	}): Promise<Reaction> {
		const result = await this.db
			.prepare(
				`INSERT INTO reactions (id, user_id, target_type, target_id, reaction_type)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(user_id, target_type, target_id) 
				 DO UPDATE SET reaction_type = excluded.reaction_type
				 RETURNING *`
			)
			.bind(data.id, data.user_id, data.target_type, data.target_id, data.reaction_type)
			.first<Reaction>();

		if (!result) throw new Error('Failed to add reaction');
		return result;
	}

	async removeReaction(user_id: string, target_type: string, target_id: string): Promise<boolean> {
		const result = await this.db
			.prepare('DELETE FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?')
			.bind(user_id, target_type, target_id)
			.run();

		return result.success;
	}

	async getReactionCounts(target_type: string, target_id: string) {
		const results = await this.db
			.prepare(
				`SELECT reaction_type, COUNT(*) as count
				 FROM reactions
				 WHERE target_type = ? AND target_id = ?
				 GROUP BY reaction_type`
			)
			.bind(target_type, target_id)
			.all<{ reaction_type: string; count: number }>();

		const counts = {
			like: 0,
			love: 0,
			haha: 0,
			wow: 0,
			sad: 0,
			angry: 0,
			total: 0
		};

		results.results?.forEach((r) => {
			counts[r.reaction_type as keyof typeof counts] = r.count;
			counts.total += r.count;
		});

		return counts;
	}

	// Session operations
	async createSession(data: { id: string; user_id: string; expires_at: number }): Promise<Session> {
		const result = await this.db
			.prepare(
				`INSERT INTO sessions (id, user_id, expires_at)
				 VALUES (?, ?, ?)
				 RETURNING *`
			)
			.bind(data.id, data.user_id, data.expires_at)
			.first<Session>();

		if (!result) throw new Error('Failed to create session');
		return result;
	}

	async getSession(id: string): Promise<Session | null> {
		return await this.db
			.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > unixepoch()')
			.bind(id)
			.first<Session>();
	}

	async deleteSession(id: string): Promise<boolean> {
		const result = await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
		return result.success;
	}
}

// Helper function to get raw D1 database from platform
// This is used by bot endpoints that need direct database access
export function getDB(platform: App.Platform | undefined): D1Database {
	if (!platform?.env?.DB) {
		throw new Error('Database not available');
	}
	return platform.env.DB;
}
