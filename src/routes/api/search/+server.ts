import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Global search endpoint using SQLite FTS5
 * 
 * Searches across:
 * - Users (name, username, bio)
 * - Posts (content)
 * - Comments (content)
 * 
 * GET /api/search?q=query&type=all&limit=20
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const query = url.searchParams.get('q');
	const type = url.searchParams.get('type') || 'all'; // all, users, posts, comments
	const limit = parseInt(url.searchParams.get('limit') || '20');

	if (!query || query.trim().length === 0) {
		return json({
			users: [],
			posts: [],
			comments: [],
			total: 0
		});
	}

	try {
		const searchTerm = query.trim();
		const results: any = {
			users: [],
			posts: [],
			comments: [],
			total: 0
		};

		// Search users using FTS5
		if (type === 'all' || type === 'users') {
			const userResults = await db
				.prepare(
					`SELECT 
						u.id,
						u.name as display_name,
						u.username,
						u.image as profile_picture_url,
						u.bio,
						u.sprite_id,
						fts.rank
					FROM user_fts fts
					JOIN user u ON fts.user_id = u.id
					WHERE user_fts MATCH ?
					ORDER BY rank
					LIMIT ?`
				)
				.bind(searchTerm, limit)
				.all();

			results.users = userResults.results || [];
		}

		// Search posts using FTS5
		if (type === 'all' || type === 'posts') {
			const postResults = await db
				.prepare(
					`SELECT 
						p.id,
						p.content,
						p.image_url,
						p.created_at,
						p.user_id,
						u.name as user_display_name,
						u.username as user_username,
						u.image as user_profile_picture_url,
						u.sprite_id as user_sprite_id,
						fts.rank
					FROM post_fts fts
					JOIN posts p ON fts.post_id = p.id
					JOIN user u ON p.user_id = u.id
					WHERE post_fts MATCH ?
					ORDER BY rank
					LIMIT ?`
				)
				.bind(searchTerm, limit)
				.all();

			results.posts = (postResults.results || []).map((post: any) => ({
				...post,
				user: {
					id: post.user_id,
					display_name: post.user_display_name,
					username: post.user_username,
					profile_picture_url: post.user_profile_picture_url,
					sprite_id: post.user_sprite_id
				}
			}));
		}

		// Search comments using FTS5
		if (type === 'all' || type === 'comments') {
			const commentResults = await db
				.prepare(
					`SELECT 
						c.id,
						c.content,
						c.post_id,
						c.created_at,
						c.user_id,
						u.name as user_display_name,
						u.username as user_username,
						u.image as user_profile_picture_url,
						u.sprite_id as user_sprite_id,
						p.content as post_preview,
						fts.rank
					FROM comment_fts fts
					JOIN comments c ON fts.comment_id = c.id
					JOIN user u ON c.user_id = u.id
					JOIN posts p ON c.post_id = p.id
					WHERE comment_fts MATCH ?
					ORDER BY rank
					LIMIT ?`
				)
				.bind(searchTerm, limit)
				.all();

			results.comments = (commentResults.results || []).map((comment: any) => ({
				...comment,
				user: {
					id: comment.user_id,
					display_name: comment.user_display_name,
					username: comment.user_username,
					profile_picture_url: comment.user_profile_picture_url,
					sprite_id: comment.user_sprite_id
				}
			}));
		}

		results.total = results.users.length + results.posts.length + results.comments.length;

		return json(results);
	} catch (err) {
		console.error('Search error:', err);
		throw error(500, 'Search failed');
	}
};

