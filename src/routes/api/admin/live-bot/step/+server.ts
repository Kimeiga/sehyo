import { error, json } from '@sveltejs/kit';
import type { Ai, D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import {
	generateLiveBotAnswer,
	generateLiveBotComment,
	getSeedAuthors,
	type SeedAuthor
} from '$lib/server/ai-bots';
import { getActivePrompt } from '$lib/server/prompts';

const ROOM_RE = /^[a-z0-9_-]+$/i;
const RECENT_CONTENT_WINDOW_SECONDS = 20 * 60;
const MAX_RECENT_BOT_CONTENT = 4;

interface PostTarget {
	id: string;
	user_id: string;
	content: string;
	author_name: string | null;
}

interface CommentTarget {
	id: string;
	post_id: string;
	user_id: string;
	content: string;
	author_name: string | null;
}

type CursorAction = 'idle' | 'answer' | 'reply' | 'typing' | 'click';

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const secret = request.headers.get('x-admin-secret');
	if (!env?.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
		throw error(401, 'Unauthorized');
	}
	if (!env.DB || !env.TYPING_INJECT_URL || !env.ADMIN_SECRET) {
		throw error(500, 'Live bot bindings missing');
	}

	const body = (await request.json().catch(() => null)) as {
		room?: unknown;
		initial?: unknown;
	} | null;
	const room = typeof body?.room === 'string' && ROOM_RE.test(body.room) ? body.room : 'forum';

	const work = runLiveBotStep({
		db: env.DB,
		ai: env.AI,
		injectUrl: env.TYPING_INJECT_URL,
		injectSecret: env.ADMIN_SECRET,
		room,
		model: env.LIVE_BOT_MODEL,
		initial: body?.initial === true
	}).catch((err) => console.error('live bot step failed:', err));

	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(work);
	} else {
		await work;
	}

	return json({ scheduled: true });
};

async function runLiveBotStep(opts: {
	db: D1Database;
	ai?: Ai;
	injectUrl: string;
	injectSecret: string;
	room: string;
	model?: string;
	initial?: boolean;
}) {
	const prompt = await getActivePrompt(opts.db);
	if (!prompt) return;

	const authors = await getSeedAuthors(opts.db);
	if (authors.length === 0) return;

	const [posts, commentTargets, recentLiveActivityCount] = await Promise.all([
		loadPromptPosts(opts.db, prompt.id),
		loadPromptComments(opts.db, prompt.id),
		countRecentLiveBotActivity(opts.db)
	]);

	const answeredUserIds = new Set(posts.map((post) => post.user_id));
	const answerCandidates = authors.filter((author) => !answeredUserIds.has(author.user_id));
	const commentablePosts = posts.filter((post) =>
		authors.some((author) => author.user_id !== post.user_id)
	);
	const commentableComments = commentTargets.filter((comment) =>
		authors.some((author) => author.user_id !== comment.user_id)
	);
	const canWrite = !!opts.ai && recentLiveActivityCount < MAX_RECENT_BOT_CONTENT;

	if (opts.initial) {
		if (canWrite) {
			const wrote = await createLiveCommentOrAnswer(
				opts,
				authors,
				commentablePosts,
				commentableComments,
				answerCandidates,
				{ id: prompt.id, text: prompt.prompt_text },
				posts
			);
			if (wrote) return;
		}
		await showAmbientCursor(opts, authors);
		return;
	}

	const roll = Math.random();

	if (!canWrite || roll < 0.3) {
		await showAmbientCursor(opts, authors);
		return;
	}

	if (roll < 0.88) {
		const wrote = await createLiveCommentOrAnswer(
			opts,
			authors,
			commentablePosts,
			commentableComments,
			answerCandidates,
			{ id: prompt.id, text: prompt.prompt_text },
			posts
		);
		if (wrote) return;
		await showAmbientCursor(opts, authors);
		return;
	}

	const author = pick(answerCandidates);
	if (opts.ai && author) {
		const wrote = await createLiveAnswer(
			opts,
			author,
			{ id: prompt.id, text: prompt.prompt_text },
			posts
		);
		if (wrote) return;
	}

	const wrote = await createLiveCommentOrAnswer(
		opts,
		authors,
		commentablePosts,
		commentableComments,
		answerCandidates,
		{ id: prompt.id, text: prompt.prompt_text },
		posts
	);
	if (!wrote) await showAmbientCursor(opts, authors);
}

async function showAmbientCursor(
	opts: { injectUrl: string; injectSecret: string; room: string },
	authors: SeedAuthor[]
) {
	const author = pick(authors);
	if (!author) return;
	await moveCursor(opts, author, 'idle');
}

async function createLiveCommentOrAnswer(
	opts: {
		db: D1Database;
		ai?: Ai;
		injectUrl: string;
		injectSecret: string;
		room: string;
		model?: string;
	},
	authors: SeedAuthor[],
	commentablePosts: PostTarget[],
	commentableComments: CommentTarget[],
	answerCandidates: SeedAuthor[],
	prompt: { id: string; text: string },
	existingPosts: PostTarget[]
): Promise<boolean> {
	if (!opts.ai) return false;
	const target = pick(commentableComments) ?? pick(commentablePosts);
	const author = pickAuthorForTarget(authors, target?.user_id);
	if (target && author) {
		return createLiveComment(opts, author, target);
	}

	const answerAuthor = pick(answerCandidates);
	if (!answerAuthor) return false;
	return createLiveAnswer(opts, answerAuthor, prompt, existingPosts);
}

async function createLiveAnswer(
	opts: {
		db: D1Database;
		ai?: Ai;
		injectUrl: string;
		injectSecret: string;
		room: string;
		model?: string;
	},
	author: SeedAuthor,
	prompt: { id: string; text: string },
	existingPosts: PostTarget[]
): Promise<boolean> {
	if (!opts.ai) return false;
	const text = await generateLiveBotAnswer(
		opts.ai,
		prompt.text,
		author,
		existingPosts.map((post) => post.content),
		opts.model
	);
	if (!text) return false;

	const postId = crypto.randomUUID();
	const createdAt = Math.floor(Date.now() / 1000);
	try {
		await opts.db
			.prepare(
				`INSERT INTO posts (id, user_id, prompt_id, content, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(postId, author.user_id, prompt.id, text, createdAt, createdAt)
			.run();
	} catch (err) {
		console.error('live answer insert failed:', err);
		return false;
	}
	await markLiveBotActive(opts.db, author.user_id);

	const profile = await loadUserProfile(opts.db, author.user_id);

	await moveCursor(opts, author, 'answer', 'prompt');
	await inject(opts, typingMessage(author, 'prompt'));
	await sleep(Math.min(3000, Math.max(900, text.length * 18)));
	const delivered = await injectWithRetry(opts, {
		type: 'post',
		post: {
			id: postId,
			user_id: author.user_id,
			content: text,
			created_at: createdAt,
			display_name: author.name,
			username: profile?.username ?? null,
			bot_id: author.bot_id,
			comment_count: 0,
			image: profile?.image ?? null
		}
	});
	await inject(opts, { type: 'leave', userId: author.user_id });
	return delivered;
}

async function createLiveComment(
	opts: {
		db: D1Database;
		ai?: Ai;
		injectUrl: string;
		injectSecret: string;
		room: string;
		model?: string;
	},
	author: SeedAuthor,
	target: PostTarget | CommentTarget
): Promise<boolean> {
	if (!opts.ai) return false;
	const isCommentTarget = 'post_id' in target;
	const postId = isCommentTarget ? target.post_id : target.id;
	const parentCommentId = isCommentTarget ? target.id : null;
	const threadId = parentCommentId ? `reply-${parentCommentId}` : `post-${postId}`;

	const text = await generateLiveBotComment(
		opts.ai,
		{
			commenter: author,
			parentAuthorName: target.author_name ?? 'someone',
			parentText: target.content,
			isNested: isCommentTarget
		},
		opts.model
	);
	if (!text) return false;

	const commentId = crypto.randomUUID();
	const createdAt = Math.floor(Date.now() / 1000);
	try {
		await opts.db
			.prepare(
				`INSERT INTO comments
				 (id, post_id, user_id, parent_comment_id, content, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(commentId, postId, author.user_id, parentCommentId, text, createdAt, createdAt)
			.run();
	} catch (err) {
		console.error('live comment insert failed:', err);
		return false;
	}
	await markLiveBotActive(opts.db, author.user_id);

	const [profile, sortRow] = await Promise.all([
		loadUserProfile(opts.db, author.user_id),
		opts.db
			.prepare('SELECT rowid as sort_order FROM comments WHERE id = ?')
			.bind(commentId)
			.first<{ sort_order: number | null }>()
	]);

	await moveCursor(opts, author, 'reply', threadId);
	await inject(opts, typingMessage(author, threadId));
	await sleep(Math.min(2600, Math.max(800, text.length * 22)));
	const delivered = await injectWithRetry(opts, {
		type: 'comment',
		postId,
		comment: {
			id: commentId,
			post_id: postId,
			content: text,
			created_at: createdAt,
			updated_at: createdAt,
			user_id: author.user_id,
			parent_comment_id: parentCommentId,
			sort_order: sortRow?.sort_order ?? null,
			user: {
				id: author.user_id,
				display_name: author.name,
				username: profile?.username ?? null,
				profile_picture_url: profile?.image ?? null
			}
		}
	});
	await inject(opts, { type: 'leave', userId: author.user_id });
	return delivered;
}

async function loadPromptPosts(db: D1Database, promptId: string): Promise<PostTarget[]> {
	const res = await db
		.prepare(
			`SELECT p.id, p.user_id, p.content, u.name as author_name
			 FROM posts p
			 JOIN user u ON u.id = p.user_id
			 WHERE p.prompt_id = ?
			 ORDER BY p.created_at DESC, p.rowid DESC
			 LIMIT 80`
		)
		.bind(promptId)
		.all<PostTarget>();
	return res.results ?? [];
}

async function loadPromptComments(db: D1Database, promptId: string): Promise<CommentTarget[]> {
	const res = await db
		.prepare(
			`SELECT c.id, c.post_id, c.user_id, c.content, u.name as author_name
			 FROM comments c
			 JOIN posts p ON p.id = c.post_id
			 JOIN user u ON u.id = c.user_id
			 WHERE p.prompt_id = ?
			 ORDER BY c.created_at DESC, c.rowid DESC
			 LIMIT 80`
		)
		.bind(promptId)
		.all<CommentTarget>();
	return res.results ?? [];
}

async function countRecentLiveBotActivity(db: D1Database): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) as n
			 FROM bot_profiles
			 WHERE is_active = 1
			   AND last_post_at IS NOT NULL
			   AND datetime(last_post_at) >= datetime('now', ?)`
		)
		.bind(`-${RECENT_CONTENT_WINDOW_SECONDS} seconds`)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

async function markLiveBotActive(db: D1Database, userId: string): Promise<void> {
	try {
		await db
			.prepare(
				`UPDATE bot_profiles
				 SET last_post_at = datetime('now'), updated_at = datetime('now')
				 WHERE user_id = ?`
			)
			.bind(userId)
			.run();
	} catch (err) {
		console.error('live bot activity mark failed:', err);
	}
}

async function loadUserProfile(
	db: D1Database,
	userId: string
): Promise<{ username: string | null; image: string | null } | null> {
	return await db
		.prepare('SELECT username, image FROM user WHERE id = ?')
		.bind(userId)
		.first<{ username: string | null; image: string | null }>();
}

function typingMessage(author: SeedAuthor, threadId: string) {
	return {
		type: 'typing',
		userId: author.user_id,
		displayName: author.name,
		expiresAt: Date.now() + 8000,
		threadId
	};
}

async function moveCursor(
	opts: { injectUrl: string; injectSecret: string; room: string },
	author: SeedAuthor,
	action: CursorAction,
	threadId?: string
) {
	const steps = rand(2, 4);
	for (let i = 0; i < steps; i += 1) {
		const point = cursorPoint(action, i / Math.max(1, steps - 1));
		await inject(opts, {
			type: 'cursor',
			userId: author.user_id,
			displayName: author.name,
			x: point.x,
			y: point.y,
			action: i === steps - 1 ? 'click' : action,
			threadId,
			expiresAt: Date.now() + 4200
		});
		await sleep(rand(650, 1500));
	}
}

function cursorPoint(action: CursorAction, progress: number): { x: number; y: number } {
	const jitter = () => (Math.random() - 0.5) * 0.06;
	if (action === 'answer') {
		return {
			x: clamp(0.48 + progress * 0.08 + jitter(), 0.08, 0.92),
			y: clamp(0.3 + progress * 0.11 + jitter(), 0.12, 0.82)
		};
	}
	if (action === 'reply' || action === 'typing' || action === 'click') {
		return {
			x: clamp(0.28 + progress * 0.16 + jitter(), 0.08, 0.92),
			y: clamp(0.52 + progress * 0.18 + jitter(), 0.16, 0.9)
		};
	}
	return {
		x: clamp(0.18 + Math.random() * 0.64, 0.08, 0.92),
		y: clamp(0.2 + Math.random() * 0.62, 0.12, 0.88)
	};
}

async function inject(
	opts: { injectUrl: string; injectSecret: string; room: string },
	message: unknown
): Promise<boolean> {
	try {
		const res = await fetch(opts.injectUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-inject-secret': opts.injectSecret },
			body: JSON.stringify({ room: opts.room, message })
		});
		if (!res.ok) {
			console.error('live inject failed:', res.status);
			return false;
		}
		return true;
	} catch (err) {
		console.error('live inject threw:', err);
		return false;
	}
}

async function injectWithRetry(
	opts: { injectUrl: string; injectSecret: string; room: string },
	message: unknown
): Promise<boolean> {
	if (await inject(opts, message)) return true;
	await sleep(350);
	return inject(opts, message);
}

function pick<T>(items: T[]): T | null {
	if (items.length === 0) return null;
	return items[Math.floor(Math.random() * items.length)] ?? null;
}

function pickAuthorForTarget(
	authors: SeedAuthor[],
	targetUserId: string | undefined
): SeedAuthor | null {
	const pool = targetUserId ? authors.filter((author) => author.user_id !== targetUserId) : authors;
	return pick(pool);
}

function rand(min: number, max: number): number {
	return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
