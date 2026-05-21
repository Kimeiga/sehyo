/**
 * sehyo-typing Worker
 *
 * Owns the ForumRoom Durable Object. Browsers open a WebSocket to
 *   wss://<this-worker>/ws/<roomId>
 * and the upgrade is forwarded to the singleton DO for that room.
 * The DO is a pure fan-out relay: when one socket sends a "typing"
 * message, the DO broadcasts it to every other socket in the room.
 *
 * Dev-mode bypass: when the request's hostname is localhost (i.e.
 * wrangler dev), the cookie check is skipped and userId+displayName
 * come straight from the URL. This branch is unreachable in
 * production — the Worker is only routed to via typing.sehyo.com.
 *
 * Instrumentation: every step traces via console.debug with
 * `[typing/worker]` and `[typing/do]` prefixes. Output is visible in
 * the wrangler dev terminal.
 */

const TYPING_TTL_MS = 5000;
const LIVE_ACTIVITY_ENDPOINT = '/api/admin/live-bot/step';
const LIVE_ACTIVITY_INITIAL_MIN_MS = 4000;
const LIVE_ACTIVITY_INITIAL_MAX_MS = 12000;
const LIVE_ACTIVITY_MIN_MS = 45000;
const LIVE_ACTIVITY_MAX_MS = 150000;
const LIVE_ALARM_INITIAL_KEY = 'live-alarm-initial';

const WTAG = '[typing/worker]';
const DTAG = '[typing/do]';
const wdbg = (...args: unknown[]) => console.debug(WTAG, ...args);
const ddbg = (...args: unknown[]) => console.debug(DTAG, ...args);

export interface Env {
	ROOM: DurableObjectNamespace;
	API_BASE_URL: string;
	// Shared secret (same value as the Pages app's ADMIN_SECRET) that
	// guards the server-side /inject route. Set via
	//   grep '^ADMIN_SECRET=' .dev.vars | cut -d= -f2- | wrangler secret put ADMIN_SECRET
	ADMIN_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		wdbg('fetch() entry', {
			method: request.method,
			pathname: url.pathname,
			hostname: url.hostname,
			search: url.search,
			hasUpgrade: request.headers.get('Upgrade') === 'websocket'
		});

		// Server-side broadcast injection. The Pages app POSTs here to
		// make a bot "appear typing" / push its reply into a room
		// without holding a WebSocket. Auth: x-inject-secret must
		// match ADMIN_SECRET.
		if (url.pathname === '/inject' && request.method === 'POST') {
			if (request.headers.get('x-inject-secret') !== env.ADMIN_SECRET) {
				wdbg('/inject unauthorized');
				return new Response('Unauthorized', { status: 401 });
			}
			let body: { room?: unknown; message?: unknown };
			try {
				body = (await request.json()) as typeof body;
			} catch {
				return new Response('Bad JSON', { status: 400 });
			}
			const room = typeof body.room === 'string' ? body.room : '';
			if (!/^[a-z0-9_-]+$/i.test(room) || !body.message || typeof body.message !== 'object') {
				return new Response('Bad request', { status: 400 });
			}
			const id = env.ROOM.idFromName(room);
			const stub = env.ROOM.get(id);
			wdbg('/inject → DO broadcast', { room, message: body.message });
			return stub.fetch('https://do/broadcast', {
				method: 'POST',
				body: JSON.stringify(body.message)
			});
		}

		const match = url.pathname.match(/^\/ws\/([a-z0-9_-]+)$/i);
		if (!match) {
			wdbg('path mismatch → 404', { pathname: url.pathname });
			return new Response('Not found', { status: 404 });
		}
		if (request.headers.get('Upgrade') !== 'websocket') {
			wdbg('missing Upgrade header → 426');
			return new Response('Expected websocket upgrade', { status: 426 });
		}

		// `wrangler dev` simulates the production hostname once a
		// custom_domain route exists in wrangler.toml, so a bare
		// hostname check no longer identifies local dev. Also treat
		// "API_BASE_URL points at localhost" as dev — that override
		// is the documented local-dev setup (workers/README.md) and
		// is never true in production (where it's https://sehyo.com).
		const apiIsLocal = /\/\/(localhost|127\.0\.0\.1)/.test(env.API_BASE_URL ?? '');
		const isDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || apiIsLocal;
		wdbg('mode resolved', { isDev, hostname: url.hostname, apiIsLocal });
		const doUrl = new URL(request.url);

		if (isDev) {
			const userId = url.searchParams.get('userId') || 'dev-anon';
			const displayName = url.searchParams.get('displayName') || 'Dev Tab';
			wdbg('dev-mode bypass — using URL params', { userId, displayName });
			doUrl.searchParams.set('userId', userId);
			doUrl.searchParams.set('displayName', displayName);
			doUrl.searchParams.set('canBroadcast', '1');
		} else {
			const cookie = request.headers.get('Cookie');
			wdbg('prod auth path — cookie present?', { hasCookie: !!cookie });
			if (!cookie) {
				const watchOnly = watchOnlyIdentity(url);
				if (!watchOnly) {
					wdbg('no cookie → 401');
					return new Response('Unauthorized', { status: 401 });
				}
				wdbg('no cookie → accepting watch-only viewer', watchOnly);
				doUrl.searchParams.set('userId', watchOnly.userId);
				doUrl.searchParams.set('displayName', watchOnly.displayName);
				doUrl.searchParams.set('canBroadcast', '0');
			} else {
				wdbg('calling resolveSession');
				const session = await resolveSession(env.API_BASE_URL, cookie);
				wdbg('resolveSession result', { session });
				if (!session) {
					const watchOnly = watchOnlyIdentity(url);
					if (!watchOnly) {
						wdbg('session invalid → 401');
						return new Response('Unauthorized', { status: 401 });
					}
					wdbg('session invalid → accepting watch-only viewer', watchOnly);
					doUrl.searchParams.set('userId', watchOnly.userId);
					doUrl.searchParams.set('displayName', watchOnly.displayName);
					doUrl.searchParams.set('canBroadcast', '0');
				} else {
					doUrl.searchParams.set('userId', session.userId);
					doUrl.searchParams.set('displayName', session.displayName);
					doUrl.searchParams.set('canBroadcast', '1');
				}
			}
		}

		const roomId = match[1];
		const id = env.ROOM.idFromName(roomId);
		const stub = env.ROOM.get(id);
		wdbg('forwarding to DO', { roomId, doUrl: doUrl.toString() });
		return stub.fetch(new Request(doUrl.toString(), request));
	}
};

interface ResolvedSession {
	userId: string;
	displayName: string;
}

function watchOnlyIdentity(url: URL): ResolvedSession | null {
	if (url.searchParams.get('watchOnly') !== '1') return null;
	const userId = url.searchParams.get('userId') ?? '';
	if (!/^viewer_[a-z0-9_-]{6,64}$/i.test(userId)) return null;
	const rawDisplayName = url.searchParams.get('displayName') ?? 'Viewer';
	const displayName = rawDisplayName.trim().slice(0, 40) || 'Viewer';
	return { userId, displayName };
}

async function resolveSession(apiBaseUrl: string, cookie: string): Promise<ResolvedSession | null> {
	const target = `${apiBaseUrl}/api/auth/get-session`;
	wdbg('resolveSession → fetch', { target });
	let res: Response;
	try {
		res = await fetch(target, {
			headers: { cookie, accept: 'application/json' }
		});
	} catch (err) {
		wdbg('resolveSession fetch threw', { err: String(err) });
		return null;
	}
	wdbg('resolveSession got response', { status: res.status, ok: res.ok });
	if (!res.ok) return null;

	let body: unknown;
	try {
		body = await res.json();
	} catch (err) {
		wdbg('resolveSession JSON parse threw', { err: String(err) });
		return null;
	}

	const user = (body as { user?: { id?: unknown; name?: unknown; username?: unknown } } | null)
		?.user;
	if (!user || typeof user.id !== 'string') {
		wdbg('resolveSession body has no usable user', { body });
		return null;
	}

	const displayName =
		(typeof user.name === 'string' && user.name) ||
		(typeof user.username === 'string' && user.username) ||
		'Someone';

	return { userId: user.id, displayName };
}

interface SocketAttachment {
	userId: string;
	displayName: string;
	canBroadcast?: boolean;
}

interface TypingBroadcast {
	type: 'typing';
	userId: string;
	displayName: string;
	expiresAt: number;
	/** Scopes the indicator to a particular composer. "world" is the
	 *  shared world composer; per-post threads use "post-<id>"; replies
	 *  use "reply-<commentId>". */
	threadId: string;
}

interface LeaveBroadcast {
	type: 'leave';
	userId: string;
}

/** Server-injected: a bot's reply is now live. Clients append it to
 *  the matching post's comment list without a reload. Shape is
 *  whatever the Pages app sends; the client validates. */
interface CommentBroadcast {
	type: 'comment';
	postId: string;
	comment: unknown;
}

interface PostBroadcast {
	type: 'post';
	post: unknown;
}

interface CursorBroadcast {
	type: 'cursor';
	userId: string;
	displayName: string;
	x: number;
	y: number;
	action?: 'idle' | 'answer' | 'reply' | 'typing' | 'click';
	expiresAt?: number;
}

type ServerBroadcast =
	| TypingBroadcast
	| LeaveBroadcast
	| CommentBroadcast
	| PostBroadcast
	| CursorBroadcast;

export class ForumRoom {
	private state: DurableObjectState;
	private env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
		ddbg('constructor() — DO instance instantiated/re-hydrated');
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Server-side injection from the Worker's /inject route: take a
		// pre-built message and fan it out to every connected socket
		// (no `except` — the user watching their thread is the target).
		if (url.pathname === '/broadcast') {
			let msg: ServerBroadcast;
			try {
				msg = (await request.json()) as typeof msg;
			} catch {
				return new Response('Bad JSON', { status: 400 });
			}
			ddbg('/broadcast inject', msg);
			this.broadcast(msg, null);
			return new Response('ok');
		}

		const userId = url.searchParams.get('userId');
		const displayName = url.searchParams.get('displayName');
		const canBroadcast = url.searchParams.get('canBroadcast') !== '0';
		ddbg('fetch() entry', { userId, displayName });
		if (!userId || !displayName) {
			ddbg('missing userId/displayName → 400');
			return new Response('Missing userId/displayName', { status: 400 });
		}

		const pair = new WebSocketPair();
		const [client, server] = [pair[0], pair[1]];

		ddbg('state.acceptWebSocket() — hibernatable accept');
		this.state.acceptWebSocket(server);
		server.serializeAttachment({ userId, displayName, canBroadcast } satisfies SocketAttachment);
		ddbg('serializeAttachment done', {
			userId,
			displayName,
			canBroadcast,
			totalSockets: this.state.getWebSockets().length
		});
		this.scheduleLiveActivity(true).catch((err) =>
			ddbg('scheduleLiveActivity after connect failed', String(err))
		);

		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		ddbg('webSocketMessage event', {
			type: typeof raw,
			len: typeof raw === 'string' ? raw.length : (raw as ArrayBuffer).byteLength
		});
		if (typeof raw !== 'string') {
			ddbg('ignored — non-string frame');
			return;
		}

		let msg: unknown;
		try {
			msg = JSON.parse(raw);
		} catch (err) {
			ddbg('JSON parse failed', { raw, err: String(err) });
			return;
		}
		if (!isClientMessage(msg)) {
			ddbg('rejected — unknown message shape', msg);
			return;
		}

		const self = ws.deserializeAttachment() as SocketAttachment | null;
		ddbg('deserializeAttachment for sender', { self });
		if (!self) {
			ddbg('no attachment — skipping');
			return;
		}
		if (self.canBroadcast === false) {
			ddbg('watch-only socket sent a client frame — ignoring');
			return;
		}

		if (msg.type === 'typing') {
			const threadId =
				typeof msg.threadId === 'string' && THREAD_ID_RE.test(msg.threadId)
					? msg.threadId
					: 'world';
			const broadcast: TypingBroadcast = {
				type: 'typing',
				userId: self.userId,
				displayName: self.displayName,
				expiresAt: Date.now() + TYPING_TTL_MS,
				threadId
			};
			ddbg('broadcasting typing', broadcast);
			this.broadcast(broadcast, ws);
		}
	}

	webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		ddbg('webSocketClose event', { code, reason, wasClean });
		const self = ws.deserializeAttachment() as SocketAttachment | null;
		if (!self) {
			ddbg('webSocketClose: no attachment — no leave to broadcast');
			return;
		}
		const broadcast: LeaveBroadcast = { type: 'leave', userId: self.userId };
		ddbg('broadcasting leave', broadcast);
		this.broadcast(broadcast, ws);
		const remainingSockets = this.state.getWebSockets().filter((socket) => socket !== ws);
		if (remainingSockets.length === 0) {
			this.state.storage
				.deleteAlarm()
				.then(() => this.state.storage.delete(LIVE_ALARM_INITIAL_KEY))
				.catch((err) => ddbg('deleteAlarm after final close failed', String(err)));
		}
	}

	webSocketError(ws: WebSocket, err: unknown) {
		ddbg('webSocketError event', { err: String(err) });
		try {
			this.webSocketClose(ws, 1011, 'error', false);
		} catch (e) {
			ddbg('webSocketError handler threw', String(e));
		}
	}

	async alarm() {
		const sockets = this.state.getWebSockets();
		const initial = (await this.state.storage.get<boolean>(LIVE_ALARM_INITIAL_KEY)) === true;
		await this.state.storage.delete(LIVE_ALARM_INITIAL_KEY);
		if (sockets.length === 0) {
			ddbg('alarm fired with no sockets, no live activity');
			return;
		}

		const base = (this.env.API_BASE_URL ?? '').replace(/\/+$/, '');
		if (!base || !this.env.ADMIN_SECRET) {
			ddbg('alarm missing API_BASE_URL or ADMIN_SECRET');
			await this.scheduleLiveActivity(false, true);
			return;
		}

		try {
			const target = `${base}${LIVE_ACTIVITY_ENDPOINT}`;
			ddbg('alarm → live activity endpoint', { target, sockets: sockets.length });
			await fetch(target, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-admin-secret': this.env.ADMIN_SECRET
				},
				body: JSON.stringify({ room: 'forum', initial })
			});
		} catch (err) {
			ddbg('live activity fetch failed', String(err));
		}

		if (this.state.getWebSockets().length > 0) {
			await this.scheduleLiveActivity(false, true);
		}
	}

	private async scheduleLiveActivity(initial: boolean, replace = false) {
		if (this.state.getWebSockets().length === 0) return;
		const now = Date.now();
		const existing = await this.state.storage.getAlarm();
		if (existing !== null && !replace) {
			const acceptableWait = initial ? LIVE_ACTIVITY_INITIAL_MAX_MS : LIVE_ACTIVITY_MAX_MS;
			if (existing > now && existing <= now + acceptableWait) {
				ddbg('scheduleLiveActivity skipped, alarm already set', { existing });
				return;
			}
			ddbg('scheduleLiveActivity replacing distant alarm', { existing, initial });
		}
		const min = initial ? LIVE_ACTIVITY_INITIAL_MIN_MS : LIVE_ACTIVITY_MIN_MS;
		const max = initial ? LIVE_ACTIVITY_INITIAL_MAX_MS : LIVE_ACTIVITY_MAX_MS;
		const delay = min + Math.floor(Math.random() * (max - min + 1));
		const scheduledAt = now + delay;
		await this.state.storage.put(LIVE_ALARM_INITIAL_KEY, initial);
		await this.state.storage.setAlarm(scheduledAt);
		ddbg('scheduleLiveActivity set alarm', { initial, delay, scheduledAt });
	}

	private broadcast(msg: ServerBroadcast, except: WebSocket | null) {
		const payload = JSON.stringify(msg);
		const all = this.state.getWebSockets();
		let delivered = 0;
		let skipped = 0;
		for (const ws of all) {
			if (ws === except) {
				skipped++;
				continue;
			}
			try {
				ws.send(payload);
				delivered++;
			} catch (err) {
				ddbg('broadcast send threw — socket likely closed', String(err));
			}
		}
		ddbg('broadcast done', { total: all.length, delivered, skipped });
	}
}

interface TypingClientMessage {
	type: 'typing';
	threadId?: string;
}

const THREAD_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function isClientMessage(x: unknown): x is TypingClientMessage {
	if (typeof x !== 'object' || x === null) return false;
	const o = x as { type?: unknown; threadId?: unknown };
	if (o.type !== 'typing') return false;
	if (o.threadId !== undefined) {
		if (typeof o.threadId !== 'string') return false;
		if (!THREAD_ID_RE.test(o.threadId)) return false;
	}
	return true;
}
