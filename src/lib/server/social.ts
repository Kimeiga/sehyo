import type { D1Database } from '@cloudflare/workers-types';

export type SocialKind = 'post' | 'ask' | 'offer' | 'plan';
export type PostIdentityMode = 'masked' | 'persona' | 'anonymous' | 'named';
export type CommentIdentityMode = 'thread' | 'persona' | 'anonymous' | 'named';

export interface SocialPersona {
	id: string;
	label: string;
	accent: string;
	kind: 'stable' | 'ephemeral';
}

export interface SocialCircle {
	id: string;
	name: string;
	description: string | null;
	role: 'owner' | 'member';
	member_count: number;
}

export interface SocialAuthor {
	label: string;
	accent: string;
	sublabel: string | null;
	mine: boolean;
	revealed: boolean;
	mode: string;
}

export interface SocialComment {
	id: string;
	post_id: string;
	body: string;
	created_at: number;
	updated_at: number;
	can_reveal: boolean;
	author: SocialAuthor;
}

export interface SocialPost {
	id: string;
	kind: SocialKind;
	title: string | null;
	body: string;
	place: string | null;
	happens_at: number | null;
	threshold: number | null;
	status: string;
	created_at: number;
	updated_at: number;
	circle: { id: string; name: string } | null;
	comment_count: number;
	commitment_count: number;
	my_commitment_status: string | null;
	can_commit: boolean;
	can_reveal: boolean;
	author: SocialAuthor;
	comments: SocialComment[];
}

type RawPostRow = {
	id: string;
	user_id: string;
	persona_id: string | null;
	circle_id: string | null;
	kind: SocialKind;
	identity_mode: PostIdentityMode;
	alias_label: string;
	alias_accent: string;
	title: string | null;
	body: string;
	place: string | null;
	happens_at: number | null;
	threshold: number | null;
	status: string;
	created_at: number;
	updated_at: number;
	real_name: string | null;
	real_username: string | null;
	persona_label: string | null;
	persona_accent: string | null;
	circle_name: string | null;
	comment_count: number;
	commitment_count: number;
	my_commitment_status: string | null;
	reveal_count: number;
};

type RawCommentRow = {
	id: string;
	post_id: string;
	user_id: string;
	persona_id: string | null;
	thread_alias_id: string | null;
	identity_mode: CommentIdentityMode;
	alias_label: string;
	alias_accent: string;
	body: string;
	created_at: number;
	updated_at: number;
	real_name: string | null;
	real_username: string | null;
	persona_label: string | null;
	persona_accent: string | null;
	reveal_count: number;
};

const ADJECTIVES = [
	'Blue',
	'Static',
	'Paper',
	'Glass',
	'Neon',
	'Quiet',
	'Lucky',
	'Signal',
	'Little',
	'Velvet',
	'Night',
	'Bright',
	'Silver',
	'Soft',
	'Hidden',
	'Local',
	'Warm',
	'Sharp',
	'Wild',
	'Open'
];

const NOUNS = [
	'Lantern',
	'Receipt',
	'Window',
	'Radio',
	'Comet',
	'Marker',
	'Postcard',
	'Spark',
	'Kettle',
	'Signal',
	'Corner',
	'Button',
	'Notebook',
	'Harbor',
	'Thread',
	'Pocket',
	'Match',
	'Key',
	'Bridge',
	'Parcel'
];

const ACCENTS = [
	'#00a5d8',
	'#f97316',
	'#22c55e',
	'#eab308',
	'#ec4899',
	'#38bdf8',
	'#a3e635',
	'#fb7185',
	'#c084fc',
	'#2dd4bf'
];

export function normalizePersonaLabel(label: string): string {
	return label.replace(/\s+/g, ' ').trim().slice(0, 28);
}

export function makeAlias(seed: string = crypto.randomUUID()): { label: string; accent: string } {
	const h = hashString(seed);
	const adj = ADJECTIVES[h % ADJECTIVES.length];
	const noun = NOUNS[(h >>> 8) % NOUNS.length];
	const n = ((h >>> 16) % 89) + 11;
	return {
		label: `${adj} ${noun} ${n}`,
		accent: ACCENTS[(h >>> 24) % ACCENTS.length]
	};
}

export async function listPersonas(db: D1Database, userId: string): Promise<SocialPersona[]> {
	const res = await db
		.prepare(
			`SELECT id, label, accent, kind
			 FROM personas
			 WHERE user_id = ? AND archived = 0
			 ORDER BY updated_at DESC, created_at DESC`
		)
		.bind(userId)
		.all<SocialPersona>();
	return res.results ?? [];
}

export async function ensurePersona(
	db: D1Database,
	userId: string,
	label: string
): Promise<SocialPersona> {
	const clean = normalizePersonaLabel(label);
	if (!clean) throw new Error('Persona label is required');

	const existing = await db
		.prepare(
			`SELECT id, label, accent, kind
			 FROM personas
			 WHERE user_id = ? AND lower(label) = lower(?) AND archived = 0
			 LIMIT 1`
		)
		.bind(userId, clean)
		.first<SocialPersona>();
	if (existing) return existing;

	const alias = makeAlias(`${userId}:${clean}`);
	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO personas (id, user_id, label, accent, kind)
			 VALUES (?, ?, ?, ?, 'stable')`
		)
		.bind(id, userId, clean, alias.accent)
		.run();

	return { id, label: clean, accent: alias.accent, kind: 'stable' };
}

export async function listCircles(db: D1Database, userId: string): Promise<SocialCircle[]> {
	const res = await db
		.prepare(
			`SELECT
				c.id,
				c.name,
				c.description,
				cm.role,
				(SELECT COUNT(*) FROM circle_members x WHERE x.circle_id = c.id AND x.status = 'active') AS member_count
			 FROM circles c
			 JOIN circle_members cm ON cm.circle_id = c.id
			 WHERE cm.user_id = ? AND cm.status = 'active'
			 ORDER BY c.updated_at DESC, c.created_at DESC`
		)
		.bind(userId)
		.all<SocialCircle>();
	return res.results ?? [];
}

export async function isCircleMember(
	db: D1Database,
	circleId: string,
	userId: string
): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT 1
			 FROM circle_members
			 WHERE circle_id = ? AND user_id = ? AND status = 'active'
			 LIMIT 1`
		)
		.bind(circleId, userId)
		.first<{ '1': number }>();
	return !!row;
}

export async function createCircle(
	db: D1Database,
	userId: string,
	name: string,
	description: string | null
): Promise<SocialCircle> {
	const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, 60);
	if (!cleanName) throw new Error('Circle name is required');
	const cleanDescription = description?.trim().slice(0, 240) || null;
	const circleId = crypto.randomUUID();
	const memberId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO circles (id, owner_user_id, name, description)
			 VALUES (?, ?, ?, ?)`
		)
		.bind(circleId, userId, cleanName, cleanDescription)
		.run();
	await db
		.prepare(
			`INSERT INTO circle_members (id, circle_id, user_id, role, status)
			 VALUES (?, ?, ?, 'owner', 'active')`
		)
		.bind(memberId, circleId, userId)
		.run();
	return {
		id: circleId,
		name: cleanName,
		description: cleanDescription,
		role: 'owner',
		member_count: 1
	};
}

export async function loadSocialFeed(
	db: D1Database,
	viewerUserId: string | null,
	limit = 80
): Promise<SocialPost[]> {
	const viewer = viewerUserId ?? '';
	const res = await db
		.prepare(
			`SELECT
				sp.*,
				u.name AS real_name,
				u.username AS real_username,
				pr.label AS persona_label,
				pr.accent AS persona_accent,
				c.name AS circle_name,
				(SELECT COUNT(*) FROM social_comments sc WHERE sc.post_id = sp.id) AS comment_count,
				(SELECT COUNT(*) FROM social_commitments co WHERE co.post_id = sp.id AND co.status = 'committed') AS commitment_count,
				(SELECT co.status FROM social_commitments co WHERE co.post_id = sp.id AND co.user_id = ?1 LIMIT 1) AS my_commitment_status,
				(SELECT COUNT(*) FROM social_reveals sr
				 WHERE sr.viewer_user_id = ?1
				   AND sr.owner_user_id = sp.user_id
				   AND (
				     (sr.scope = 'post' AND sr.post_id = sp.id)
				     OR (sr.scope = 'persona' AND sr.persona_id = sp.persona_id AND sp.persona_id IS NOT NULL)
				   )
				) AS reveal_count
			 FROM social_posts sp
			 JOIN user u ON u.id = sp.user_id
			 LEFT JOIN personas pr ON pr.id = sp.persona_id
			 LEFT JOIN circles c ON c.id = sp.circle_id
			 WHERE sp.circle_id IS NULL
			    OR EXISTS (
			    	SELECT 1 FROM circle_members cm
			    	WHERE cm.circle_id = sp.circle_id AND cm.user_id = ?1 AND cm.status = 'active'
			    )
			 ORDER BY sp.created_at DESC, sp.id DESC
			 LIMIT ?2`
		)
		.bind(viewer, limit)
		.all<RawPostRow>();

	const rows = res.results ?? [];
	const commentsByPost = await loadCommentsForPosts(
		db,
		rows.map((r) => r.id),
		viewerUserId,
		new Map(rows.map((r) => [r.id, r.user_id]))
	);
	return rows.map((row) => shapePost(row, viewerUserId, commentsByPost.get(row.id) ?? []));
}

export async function loadSinglePost(
	db: D1Database,
	postId: string,
	viewerUserId: string | null
): Promise<SocialPost | null> {
	const viewer = viewerUserId ?? '';
	const row = await db
		.prepare(
			`SELECT
				sp.*,
				u.name AS real_name,
				u.username AS real_username,
				pr.label AS persona_label,
				pr.accent AS persona_accent,
				c.name AS circle_name,
				(SELECT COUNT(*) FROM social_comments sc WHERE sc.post_id = sp.id) AS comment_count,
				(SELECT COUNT(*) FROM social_commitments co WHERE co.post_id = sp.id AND co.status = 'committed') AS commitment_count,
				(SELECT co.status FROM social_commitments co WHERE co.post_id = sp.id AND co.user_id = ?1 LIMIT 1) AS my_commitment_status,
				(SELECT COUNT(*) FROM social_reveals sr
				 WHERE sr.viewer_user_id = ?1
				   AND sr.owner_user_id = sp.user_id
				   AND (
				     (sr.scope = 'post' AND sr.post_id = sp.id)
				     OR (sr.scope = 'persona' AND sr.persona_id = sp.persona_id AND sp.persona_id IS NOT NULL)
				   )
				) AS reveal_count
			 FROM social_posts sp
			 JOIN user u ON u.id = sp.user_id
			 LEFT JOIN personas pr ON pr.id = sp.persona_id
			 LEFT JOIN circles c ON c.id = sp.circle_id
			 WHERE sp.id = ?
			   AND (
			   	sp.circle_id IS NULL
			   	OR EXISTS (
			   		SELECT 1 FROM circle_members cm
			   		WHERE cm.circle_id = sp.circle_id AND cm.user_id = ?1 AND cm.status = 'active'
			   	)
			   )
			 LIMIT 1`
		)
		.bind(viewer, postId)
		.first<RawPostRow>();
	if (!row) return null;
	const commentsByPost = await loadCommentsForPosts(
		db,
		[row.id],
		viewerUserId,
		new Map([[row.id, row.user_id]])
	);
	return shapePost(row, viewerUserId, commentsByPost.get(row.id) ?? []);
}

export async function loadCommentsForPosts(
	db: D1Database,
	postIds: string[],
	viewerUserId: string | null,
	postOwners?: Map<string, string>
): Promise<Map<string, SocialComment[]>> {
	const result = new Map<string, SocialComment[]>();
	if (postIds.length === 0) return result;

	const placeholders = postIds.map(() => '?').join(',');
	const viewer = viewerUserId ?? '';
	const res = await db
		.prepare(
			`SELECT
				sc.*,
				u.name AS real_name,
				u.username AS real_username,
				pr.label AS persona_label,
				pr.accent AS persona_accent,
				(SELECT COUNT(*) FROM social_reveals sr
				 WHERE sr.viewer_user_id = ?
				   AND sr.owner_user_id = sc.user_id
				   AND (
				     (sr.scope = 'comment' AND sr.comment_id = sc.id)
				     OR (sr.scope = 'persona' AND sr.persona_id = sc.persona_id AND sc.persona_id IS NOT NULL)
				   )
				) AS reveal_count
			 FROM social_comments sc
			 JOIN user u ON u.id = sc.user_id
			 LEFT JOIN personas pr ON pr.id = sc.persona_id
			 WHERE sc.post_id IN (${placeholders})
			 ORDER BY sc.created_at ASC, sc.id ASC`
		)
		.bind(viewer, ...postIds)
		.all<RawCommentRow>();

	const owners = postOwners ?? (await loadPostOwners(db, postIds));
	for (const row of res.results ?? []) {
		const list = result.get(row.post_id) ?? [];
		list.push(shapeComment(row, viewerUserId, owners.get(row.post_id) ?? null));
		result.set(row.post_id, list);
	}
	return result;
}

async function loadPostOwners(db: D1Database, postIds: string[]): Promise<Map<string, string>> {
	const placeholders = postIds.map(() => '?').join(',');
	const res = await db
		.prepare(`SELECT id, user_id FROM social_posts WHERE id IN (${placeholders})`)
		.bind(...postIds)
		.all<{ id: string; user_id: string }>();
	return new Map((res.results ?? []).map((r) => [r.id, r.user_id]));
}

export async function ensureThreadAlias(
	db: D1Database,
	postId: string,
	userId: string
): Promise<{ id: string | null; label: string; accent: string }> {
	const post = await db
		.prepare('SELECT user_id FROM social_posts WHERE id = ? LIMIT 1')
		.bind(postId)
		.first<{ user_id: string }>();
	if (!post) throw new Error('Post not found');
	if (post.user_id === userId) return { id: null, label: 'OP', accent: '#00a5d8' };

	const existing = await db
		.prepare(
			`SELECT id, label, accent
			 FROM social_thread_aliases
			 WHERE post_id = ? AND user_id = ?
			 LIMIT 1`
		)
		.bind(postId, userId)
		.first<{ id: string; label: string; accent: string }>();
	if (existing) return existing;

	const alias = makeAlias(`${postId}:${userId}:${crypto.randomUUID()}`);
	const id = crypto.randomUUID();
	try {
		await db
			.prepare(
				`INSERT INTO social_thread_aliases (id, post_id, user_id, label, accent)
				 VALUES (?, ?, ?, ?, ?)`
			)
			.bind(id, postId, userId, alias.label, alias.accent)
			.run();
		return { id, ...alias };
	} catch {
		const raced = await db
			.prepare(
				`SELECT id, label, accent
				 FROM social_thread_aliases
				 WHERE post_id = ? AND user_id = ?
				 LIMIT 1`
			)
			.bind(postId, userId)
			.first<{ id: string; label: string; accent: string }>();
		if (raced) return raced;
		throw new Error('Could not create thread alias');
	}
}

function shapePost(
	row: RawPostRow,
	viewerUserId: string | null,
	comments: SocialComment[]
): SocialPost {
	const author = resolvePostAuthor(row, viewerUserId);
	const commitmentCount = Number(row.commitment_count ?? 0);
	const threshold = row.threshold == null ? null : Number(row.threshold);
	const status =
		row.kind === 'plan' && threshold && commitmentCount >= threshold && row.status === 'open'
			? 'met'
			: row.status;
	return {
		id: row.id,
		kind: row.kind,
		title: row.title,
		body: row.body,
		place: row.place,
		happens_at: row.happens_at,
		threshold,
		status,
		created_at: row.created_at,
		updated_at: row.updated_at,
		circle: row.circle_id && row.circle_name ? { id: row.circle_id, name: row.circle_name } : null,
		comment_count: Number(row.comment_count ?? 0),
		commitment_count: commitmentCount,
		my_commitment_status: row.my_commitment_status,
		can_commit: row.kind === 'plan' && row.user_id !== viewerUserId,
		can_reveal: row.user_id === viewerUserId && row.identity_mode !== 'named',
		author,
		comments
	};
}

function shapeComment(
	row: RawCommentRow,
	viewerUserId: string | null,
	postOwnerUserId: string | null
): SocialComment {
	return {
		id: row.id,
		post_id: row.post_id,
		body: row.body,
		created_at: row.created_at,
		updated_at: row.updated_at,
		can_reveal: row.user_id === viewerUserId && row.identity_mode !== 'named',
		author: resolveCommentAuthor(row, viewerUserId, postOwnerUserId)
	};
}

function resolvePostAuthor(row: RawPostRow, viewerUserId: string | null): SocialAuthor {
	const mine = !!viewerUserId && row.user_id === viewerUserId;
	if (mine) {
		const alias = postAliasLabel(row);
		return {
			label: 'You',
			accent: row.alias_accent,
			sublabel: alias === 'Anonymous' ? 'anonymous' : alias,
			mine,
			revealed: true,
			mode: row.identity_mode
		};
	}
	if (row.reveal_count > 0 || row.identity_mode === 'named') {
		return {
			label: realLabel(row.real_name, row.real_username),
			accent: '#f5f5f5',
			sublabel: row.identity_mode === 'named' ? 'named' : 'revealed to you',
			mine,
			revealed: true,
			mode: row.identity_mode
		};
	}
	const label = postAliasLabel(row);
	return {
		label,
		accent: postAliasAccent(row),
		sublabel: row.identity_mode === 'persona' ? 'persona' : row.identity_mode,
		mine,
		revealed: false,
		mode: row.identity_mode
	};
}

function resolveCommentAuthor(
	row: RawCommentRow,
	viewerUserId: string | null,
	postOwnerUserId: string | null
): SocialAuthor {
	const mine = !!viewerUserId && row.user_id === viewerUserId;
	if (mine) {
		const alias = commentAliasLabel(row, postOwnerUserId);
		return {
			label: 'You',
			accent: row.alias_accent,
			sublabel: alias === 'Anonymous' ? 'anonymous' : alias,
			mine,
			revealed: true,
			mode: row.identity_mode
		};
	}
	if (row.reveal_count > 0 || row.identity_mode === 'named') {
		return {
			label: realLabel(row.real_name, row.real_username),
			accent: '#f5f5f5',
			sublabel: row.identity_mode === 'named' ? 'named' : 'revealed to you',
			mine,
			revealed: true,
			mode: row.identity_mode
		};
	}
	return {
		label: commentAliasLabel(row, postOwnerUserId),
		accent: commentAliasAccent(row),
		sublabel: row.identity_mode === 'thread' ? 'thread-local' : row.identity_mode,
		mine,
		revealed: false,
		mode: row.identity_mode
	};
}

function postAliasLabel(row: RawPostRow) {
	if (row.identity_mode === 'anonymous') return 'Anonymous';
	if (row.identity_mode === 'persona' && row.persona_label) return row.persona_label;
	return row.alias_label;
}

function postAliasAccent(row: RawPostRow) {
	if (row.identity_mode === 'anonymous') return '#8b8b84';
	if (row.identity_mode === 'persona' && row.persona_accent) return row.persona_accent;
	return row.alias_accent;
}

function commentAliasLabel(row: RawCommentRow, postOwnerUserId: string | null) {
	if (row.identity_mode === 'anonymous') return 'Anonymous';
	if (row.identity_mode === 'persona' && row.persona_label) return row.persona_label;
	if (row.identity_mode === 'thread' && postOwnerUserId && row.user_id === postOwnerUserId) return 'OP';
	return row.alias_label;
}

function commentAliasAccent(row: RawCommentRow) {
	if (row.identity_mode === 'anonymous') return '#8b8b84';
	if (row.identity_mode === 'persona' && row.persona_accent) return row.persona_accent;
	return row.alias_accent;
}

function realLabel(name: string | null, username: string | null) {
	return name?.trim() || (username ? `@${username}` : 'Revealed user');
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
