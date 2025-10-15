import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Database } from '$lib/server/db';
import type { ReactionType } from '$lib/types';

// POST - Add or update a reaction
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const { target_type, target_id, reaction_type } = await request.json();

	if (!target_type || !target_id || !reaction_type) {
		throw error(400, 'Missing required fields');
	}

	if (target_type !== 'post' && target_type !== 'comment') {
		throw error(400, 'Invalid target_type. Must be "post" or "comment"');
	}

	const validReactions: ReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
	if (!validReactions.includes(reaction_type as ReactionType)) {
		throw error(400, 'Invalid reaction_type');
	}

	const db = new Database(platform.env.DB);

	try {
		await db.addReaction({
			id: crypto.randomUUID(),
			user_id: locals.user.id,
			target_type,
			target_id,
			reaction_type: reaction_type as ReactionType
		});

		// Get updated reaction counts
		const reactionCounts = await db.getReactionCounts(target_type, target_id);

		return json({ success: true, reaction_counts: reactionCounts });
	} catch (err) {
		console.error('Error adding reaction:', err);
		throw error(500, 'Failed to add reaction');
	}
};

// DELETE - Remove a reaction
export const DELETE: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const { target_type, target_id } = await request.json();

	if (!target_type || !target_id) {
		throw error(400, 'Missing required fields');
	}

	if (target_type !== 'post' && target_type !== 'comment') {
		throw error(400, 'Invalid target_type. Must be "post" or "comment"');
	}

	const db = new Database(platform.env.DB);

	try {
		await db.removeReaction(locals.user.id, target_type, target_id);

		// Get updated reaction counts
		const reactionCounts = await db.getReactionCounts(target_type, target_id);

		return json({ success: true, reaction_counts: reactionCounts });
	} catch (err) {
		console.error('Error removing reaction:', err);
		throw error(500, 'Failed to remove reaction');
	}
};

// GET - Get user's reaction for a target
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const target_type = url.searchParams.get('target_type');
	const target_id = url.searchParams.get('target_id');

	if (!target_type || !target_id) {
		throw error(400, 'Missing required parameters');
	}

	if (target_type !== 'post' && target_type !== 'comment') {
		throw error(400, 'Invalid target_type. Must be "post" or "comment"');
	}

	try {
		const result = await platform.env.DB.prepare(
			'SELECT reaction_type FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?'
		)
			.bind(locals.user.id, target_type, target_id)
			.first();

		return json({
			reaction_type: result?.reaction_type || null
		});
	} catch (err) {
		console.error('Error getting user reaction:', err);
		throw error(500, 'Failed to get reaction');
	}
};

