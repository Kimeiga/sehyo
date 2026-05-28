import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ensurePersona,
	ensureThreadAlias,
	isCircleMember,
	loadSinglePost,
	type CommentIdentityMode
} from '$lib/server/social';
import { moderateSocialContent, moderationErrorMessage } from '$lib/server/moderation';

const MAX_BODY = 1400;
const IDENTITY_MODES = new Set(['thread', 'persona', 'anonymous', 'named']);

export const POST: RequestHandler = async ({ request, params, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const postRow = await db
		.prepare('SELECT id, user_id, circle_id FROM social_posts WHERE id = ? LIMIT 1')
		.bind(params.id)
		.first<{ id: string; user_id: string; circle_id: string | null }>();
	if (!postRow) throw error(404, 'Post not found');
	if (postRow.circle_id && !(await isCircleMember(db, postRow.circle_id, locals.user.id))) {
		throw error(403, 'You are not in that circle');
	}

	const body = await request.json().catch(() => null);
	const content = typeof body?.body === 'string' ? body.body.trim() : '';
	const identityMode = IDENTITY_MODES.has(body?.identity_mode)
		? (body.identity_mode as CommentIdentityMode)
		: 'thread';

	if (!content) throw error(400, 'Body is required');
	if (content.length > MAX_BODY) throw error(400, `Body is too long (max ${MAX_BODY})`);

	const moderation = await moderateSocialContent(platform.env.AI, {
		surface: 'comment',
		text: content
	});
	if (!moderation.allowed) {
		throw error(400, moderationErrorMessage(moderation));
	}

	let personaId: string | null = null;
	let threadAliasId: string | null = null;
	let alias = await ensureThreadAlias(db, params.id, locals.user.id);

	if (identityMode === 'persona') {
		const label = typeof body?.persona_label === 'string' ? body.persona_label : '';
		const persona = await ensurePersona(db, locals.user.id, label);
		personaId = persona.id;
		alias = { id: null, label: persona.label, accent: persona.accent };
	} else if (identityMode === 'anonymous') {
		alias = { id: null, label: 'Anonymous', accent: '#8b8b84' };
	} else if (identityMode === 'named') {
		alias = {
			id: null,
			label: locals.user.name || locals.user.username || 'Named user',
			accent: '#f5f5f5'
		};
	} else {
		threadAliasId = alias.id;
	}

	const commentId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`INSERT INTO social_comments
			 (id, post_id, user_id, persona_id, thread_alias_id, identity_mode, alias_label, alias_accent,
			  body, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			commentId,
			params.id,
			locals.user.id,
			personaId,
			threadAliasId,
			identityMode,
			alias.label,
			alias.accent,
			content,
			now,
			now
		)
		.run();

	const post = await loadSinglePost(db, params.id, locals.user.id);
	return json({ post, comment_id: commentId }, { status: 201 });
};
