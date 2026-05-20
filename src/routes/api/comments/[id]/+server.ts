import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { D1Database } from '@cloudflare/workers-types';
import { Database } from '$lib/server/db';

const MAX_COMMENT_LEN = 2000;
let commentEditsReady: Promise<void> | null = null;

function ensureCommentEditsTable(db: D1Database): Promise<void> {
	commentEditsReady ??= db
		.batch([
			db.prepare(
				`CREATE TABLE IF NOT EXISTS comment_edits (
					id TEXT PRIMARY KEY,
					comment_id TEXT NOT NULL,
					user_id TEXT NOT NULL,
					content TEXT NOT NULL,
					edited_at INTEGER NOT NULL DEFAULT (unixepoch()),
					FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
					FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
				)`
			),
			db.prepare(
				'CREATE INDEX IF NOT EXISTS idx_comment_edits_comment_id ON comment_edits(comment_id)'
			),
			db.prepare(
				'CREATE INDEX IF NOT EXISTS idx_comment_edits_edited_at ON comment_edits(edited_at)'
			)
		])
		.then(() => undefined)
		.catch((err) => {
			commentEditsReady = null;
			throw err;
		});
	return commentEditsReady;
}

async function loadComment(db: D1Database, id: string) {
	return await db
		.prepare(
			`SELECT
				c.*,
				c.rowid as sort_order,
				u.name as display_name,
				u.username,
				u.image as profile_picture_url
			FROM comments c
			JOIN user u ON c.user_id = u.id
			WHERE c.id = ?`
		)
		.bind(id)
		.first<{
			id: string;
			post_id: string;
			content: string;
			created_at: number;
			updated_at: number;
			user_id: string;
			parent_comment_id: string | null;
			sort_order: number | null;
			display_name: string | null;
			username: string | null;
			profile_picture_url: string | null;
		}>();
}

function shapeComment(comment: NonNullable<Awaited<ReturnType<typeof loadComment>>>) {
	const { display_name, username, profile_picture_url, ...commentData } = comment;
	return {
		...commentData,
		user: {
			id: comment.user_id,
			display_name,
			username,
			profile_picture_url
		}
	};
}

// DELETE - Delete a comment
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	// Get the comment to check ownership
	const result = await platform.env.DB.prepare('SELECT user_id FROM comments WHERE id = ?')
		.bind(params.id)
		.first();

	if (!result) {
		throw error(404, 'Comment not found');
	}

	// Check if user owns the comment
	if (result.user_id !== locals.user.id) {
		throw error(403, 'You can only delete your own comments');
	}

	// Delete the comment (cascade will handle replies and reactions)
	await platform.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(params.id).run();

	return json({ success: true });
};

// PATCH - Edit a comment and preserve the previous version.
export const PATCH: RequestHandler = async ({ params, platform, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, 'Content is required');
	if (content.length > MAX_COMMENT_LEN) {
		throw error(400, `Comment is too long (max ${MAX_COMMENT_LEN} characters)`);
	}

	const existing = await loadComment(platform.env.DB, params.id);
	if (!existing) throw error(404, 'Comment not found');
	if (existing.user_id !== locals.user.id) {
		throw error(403, 'You can only edit your own comments');
	}

	if (existing.content !== content) {
		await ensureCommentEditsTable(platform.env.DB);
		await platform.env.DB.batch([
			platform.env.DB.prepare(
				`INSERT INTO comment_edits (id, comment_id, user_id, content, edited_at)
				 VALUES (?, ?, ?, ?, unixepoch())`
			).bind(crypto.randomUUID(), existing.id, existing.user_id, existing.content),
			platform.env.DB.prepare(
				`UPDATE comments
				 SET content = ?,
				     updated_at = CASE
						WHEN unixepoch() <= updated_at THEN updated_at + 1
						ELSE unixepoch()
				     END
				 WHERE id = ?`
			).bind(content, existing.id)
		]);
	}

	const updated = await loadComment(platform.env.DB, params.id);
	if (!updated) throw error(404, 'Comment not found');
	return json({ comment: shapeComment(updated) });
};

// GET - Get replies to a comment, or previous versions with ?history=1.
export const GET: RequestHandler = async ({ params, platform, locals, url }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	if (url.searchParams.get('history') === '1') {
		await ensureCommentEditsTable(platform.env.DB);
		const comment = await platform.env.DB.prepare('SELECT id FROM comments WHERE id = ?')
			.bind(params.id)
			.first<{ id: string }>();
		if (!comment) throw error(404, 'Comment not found');

		const edits = await platform.env.DB.prepare(
			`SELECT id, comment_id, content, edited_at
			 FROM comment_edits
			 WHERE comment_id = ?
			 ORDER BY edited_at DESC, rowid DESC`
		)
			.bind(params.id)
			.all<{
				id: string;
				comment_id: string;
				content: string;
				edited_at: number;
			}>();

		return json({ edits: edits.results ?? [] });
	}

	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const db = new Database(platform.env.DB);
	const replies = await db.getCommentReplies(params.id, limit, offset);

	// Get reaction counts for each reply and structure user data
	const repliesWithReactions = await Promise.all(
		replies.map(async (reply: any) => {
			const reactionCounts = await db.getReactionCounts('comment', reply.id);

			// Structure the user data as a nested object
			const { display_name, username, profile_picture_url, sprite_id, ...replyData } = reply;

			return {
				...replyData,
				user: {
					id: reply.user_id,
					display_name,
					username,
					profile_picture_url,
					sprite_id
				},
				reaction_counts: reactionCounts
			};
		})
	);

	return json({ replies: repliesWithReactions });
};
