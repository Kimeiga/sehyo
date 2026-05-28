import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ensurePersona,
	isCircleMember,
	loadSinglePost,
	makeAlias,
	type PostIdentityMode,
	type SocialKind
} from '$lib/server/social';
import { moderateSocialContent, moderationErrorMessage } from '$lib/server/moderation';

const MAX_BODY = 2400;
const MAX_TITLE = 90;

const KINDS = new Set(['post', 'ask', 'offer', 'plan']);
const IDENTITY_MODES = new Set(['masked', 'persona', 'anonymous', 'named']);

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const body = await request.json().catch(() => null);
	const kind = KINDS.has(body?.kind) ? (body.kind as SocialKind) : 'post';
	const content = typeof body?.body === 'string' ? body.body.trim() : '';
	const title = typeof body?.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : '';
	const identityMode = IDENTITY_MODES.has(body?.identity_mode)
		? (body.identity_mode as PostIdentityMode)
		: 'masked';
	const circleId = typeof body?.circle_id === 'string' && body.circle_id ? body.circle_id : null;
	const place = typeof body?.place === 'string' ? body.place.trim().slice(0, 120) || null : null;
	const happensAt = Number.isFinite(Number(body?.happens_at))
		? Math.floor(Number(body.happens_at))
		: null;
	const thresholdRaw = Number(body?.threshold);
	const threshold =
		kind === 'plan' && Number.isFinite(thresholdRaw)
			? Math.max(2, Math.min(100, Math.floor(thresholdRaw)))
			: null;

	if (!content) throw error(400, 'Body is required');
	if (content.length > MAX_BODY) throw error(400, `Body is too long (max ${MAX_BODY})`);
	if (kind === 'plan' && !threshold) throw error(400, 'Plans need a threshold');
	if (circleId && !(await isCircleMember(db, circleId, locals.user.id))) {
		throw error(403, 'You are not in that circle');
	}

	const moderation = await moderateSocialContent(platform.env.AI, {
		surface: 'post',
		text: [
			`kind: ${kind}`,
			title ? `title: ${title}` : '',
			place ? `place: ${place}` : '',
			`body: ${content}`
		]
			.filter(Boolean)
			.join('\n')
	});
	if (!moderation.allowed) {
		throw error(400, moderationErrorMessage(moderation));
	}

	let personaId: string | null = null;
	let alias = makeAlias(`${locals.user.id}:${content}:${Date.now()}`);

	if (identityMode === 'persona') {
		const label = typeof body?.persona_label === 'string' ? body.persona_label : '';
		const persona = await ensurePersona(db, locals.user.id, label);
		personaId = persona.id;
		alias = { label: persona.label, accent: persona.accent };
	} else if (identityMode === 'anonymous') {
		alias = { label: 'Anonymous', accent: '#8b8b84' };
	} else if (identityMode === 'named') {
		alias = {
			label: locals.user.name || locals.user.username || 'Named user',
			accent: '#f5f5f5'
		};
	}

	const postId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`INSERT INTO social_posts
			 (id, user_id, persona_id, circle_id, kind, identity_mode, alias_label, alias_accent,
			  title, body, place, happens_at, threshold, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			postId,
			locals.user.id,
			personaId,
			circleId,
			kind,
			identityMode,
			alias.label,
			alias.accent,
			title || null,
			content,
			place,
			happensAt,
			threshold,
			now,
			now
		)
		.run();

	const post = await loadSinglePost(db, postId, locals.user.id);
	return json({ post }, { status: 201 });
};
