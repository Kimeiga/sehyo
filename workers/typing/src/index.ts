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

const WTAG = '[typing/worker]';
const DTAG = '[typing/do]';
const wdbg = (...args: unknown[]) => console.debug(WTAG, ...args);
const ddbg = (...args: unknown[]) => console.debug(DTAG, ...args);

export interface Env {
	ROOM: DurableObjectNamespace;
	API_BASE_URL: string;
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

		const match = url.pathname.match(/^\/ws\/([a-z0-9_-]+)$/i);
		if (!match) {
			wdbg('path mismatch → 404', { pathname: url.pathname });
			return new Response('Not found', { status: 404 });
		}
		if (request.headers.get('Upgrade') !== 'websocket') {
			wdbg('missing Upgrade header → 426');
			return new Response('Expected websocket upgrade', { status: 426 });
		}

		const isDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
		wdbg('mode resolved', { isDev });
		const doUrl = new URL(request.url);

		if (isDev) {
			const userId = url.searchParams.get('userId') || 'dev-anon';
			const displayName = url.searchParams.get('displayName') || 'Dev Tab';
			wdbg('dev-mode bypass — using URL params', { userId, displayName });
			doUrl.searchParams.set('userId', userId);
			doUrl.searchParams.set('displayName', displayName);
		} else {
			const cookie = request.headers.get('Cookie');
			wdbg('prod auth path — cookie present?', { hasCookie: !!cookie });
			if (!cookie) {
				wdbg('no cookie → 401');
				return new Response('Unauthorized', { status: 401 });
			}

			wdbg('calling resolveSession');
			const session = await resolveSession(env.API_BASE_URL, cookie);
			wdbg('resolveSession result', { session });
			if (!session) {
				wdbg('session invalid → 401');
				return new Response('Unauthorized', { status: 401 });
			}

			doUrl.searchParams.set('userId', session.userId);
			doUrl.searchParams.set('displayName', session.displayName);
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

async function resolveSession(
	apiBaseUrl: string,
	cookie: string
): Promise<ResolvedSession | null> {
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

export class ForumRoom {
	private state: DurableObjectState;

	constructor(state: DurableObjectState, _env: Env) {
		this.state = state;
		ddbg('constructor() — DO instance instantiated/re-hydrated');
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId');
		const displayName = url.searchParams.get('displayName');
		ddbg('fetch() entry', { userId, displayName });
		if (!userId || !displayName) {
			ddbg('missing userId/displayName → 400');
			return new Response('Missing userId/displayName', { status: 400 });
		}

		const pair = new WebSocketPair();
		const [client, server] = [pair[0], pair[1]];

		ddbg('state.acceptWebSocket() — hibernatable accept');
		this.state.acceptWebSocket(server);
		server.serializeAttachment({ userId, displayName } satisfies SocketAttachment);
		ddbg('serializeAttachment done', { userId, displayName, totalSockets: this.state.getWebSockets().length });

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
	}

	webSocketError(ws: WebSocket, err: unknown) {
		ddbg('webSocketError event', { err: String(err) });
		try {
			this.webSocketClose(ws, 1011, 'error', false);
		} catch (e) {
			ddbg('webSocketError handler threw', String(e));
		}
	}

	private broadcast(msg: TypingBroadcast | LeaveBroadcast, except: WebSocket) {
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
