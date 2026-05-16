/**
 * Forum typing-indicator client.
 *
 * Usage in a Svelte component:
 *
 *     const { typingUsers, notifyTyping, disconnect } =
 *         connectForumTyping('forum');
 *     onDestroy(disconnect);
 *
 *     // call notifyTyping() from the composer's input handler;
 *     // it is throttled internally.
 *
 * Wire model:
 *   - One WebSocket per call to connectForumTyping(), to wss://.../ws/<roomId>
 *   - Outbound: { type: "typing" } — throttled to once per 2.5s
 *   - Inbound: { type: "typing", userId, displayName, expiresAt }
 *              { type: "leave",  userId }
 *   - Entries self-expire at expiresAt; a 1Hz pruner sweeps stale ones
 *     in case a "leave" was missed.
 *   - Reconnect: exponential backoff up to 15s, plus jitter.
 *
 * Instrumentation: every meaningful event traces via console.debug with
 * the `[typing/client]` prefix. Enable "Verbose" log level in DevTools
 * to see them.
 */

import { writable, derived, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const THROTTLE_MS = 2500;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15000;
const PRUNE_INTERVAL_MS = 1000;
// The Worker stamps `expiresAt` using its own (server) clock. Pruning
// compares against the browser's clock, so any skew between workerd
// and the client — observed at ~6s in local dev, and unbounded in
// production where client clocks can be wrong by minutes — makes
// entries arrive already "expired" and never render. Treat the
// server timestamp as a liveness ping only; compute the real expiry
// locally. Must stay >= the Worker's TYPING_TTL_MS.
const CLIENT_TTL_MS = 5000;

const TAG = '[typing/client]';
const dbg = (...args: unknown[]) => console.debug(TAG, ...args);

interface TypingEntry {
	displayName: string;
	expiresAt: number;
	threadId: string;
}

export interface TypingUser {
	userId: string;
	displayName: string;
	expiresAt: number;
	threadId: string;
}

export interface ForumTypingHandle {
	typingUsers: Readable<TypingUser[]>;
	/** Returns true if a typing frame was actually sent on the wire,
	 *  false if it was throttled or the socket isn't open. Pass the
	 *  threadId so receivers know which composer to attribute the
	 *  indicator to (e.g. "world", "post-abc123"). */
	notifyTyping: (threadId: string) => boolean;
	disconnect: () => void;
}

export interface DevIdentity {
	userId: string;
	displayName: string;
}

export function connectForumTyping(
	roomId: string,
	devIdentity?: DevIdentity | null
): ForumTypingHandle {
	dbg('connectForumTyping()', { roomId, devIdentity, browser });

	const map = writable<Map<string, TypingEntry>>(new Map());
	const typingUsers = derived(map, (m) =>
		Array.from(m, ([userId, v]) => ({
			userId,
			displayName: v.displayName,
			expiresAt: v.expiresAt,
			threadId: v.threadId
		})).sort((a, b) => a.displayName.localeCompare(b.displayName))
	);

	if (!browser) {
		dbg('non-browser → returning no-op handle');
		return {
			typingUsers,
			notifyTyping: (_threadId: string) => false,
			disconnect: () => {}
		};
	}

	let socket: WebSocket | null = null;
	let disposed = false;
	let lastSentAt = 0;
	let reconnectAttempt = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	const pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS);

	open();

	function open() {
		if (disposed) {
			dbg('open() bail — disposed');
			return;
		}
		const url = wsUrl(roomId, devIdentity);
		dbg('open() → new WebSocket', { url, reconnectAttempt });
		const ws = new WebSocket(url);
		socket = ws;

		ws.addEventListener('open', () => {
			dbg('ws.event=open', { readyState: ws.readyState });
			reconnectAttempt = 0;
		});

		ws.addEventListener('message', (e) => {
			dbg('ws.event=message', { dataType: typeof e.data, dataLen: typeof e.data === 'string' ? e.data.length : undefined });
			if (typeof e.data !== 'string') {
				dbg('ws.message ignored — non-string');
				return;
			}
			let msg: unknown;
			try {
				msg = JSON.parse(e.data);
			} catch (err) {
				dbg('ws.message JSON parse FAILED', { raw: e.data, err: String(err) });
				return;
			}
			dbg('ws.message parsed', msg);
			handleMessage(msg);
		});

		ws.addEventListener('close', (e) => {
			dbg('ws.event=close', { code: e.code, reason: e.reason, wasClean: e.wasClean });
			socket = null;
			if (!disposed) scheduleReconnect();
		});

		ws.addEventListener('error', (e) => {
			dbg('ws.event=error', { type: e.type });
			try {
				ws.close();
			} catch (err) {
				dbg('ws.close() threw during error handler', String(err));
			}
		});
	}

	function scheduleReconnect() {
		if (reconnectTimer) {
			dbg('scheduleReconnect skipped — already scheduled');
			return;
		}
		const delay = Math.min(
			RECONNECT_BASE_MS * 2 ** reconnectAttempt,
			RECONNECT_MAX_MS
		);
		const jitter = Math.random() * 200;
		dbg('scheduleReconnect', { attempt: reconnectAttempt, delay, jitter });
		reconnectAttempt++;
		reconnectTimer = setTimeout(() => {
			dbg('reconnect timer fired → open()');
			reconnectTimer = null;
			open();
		}, delay + jitter);
	}

	function handleMessage(msg: unknown) {
		if (typeof msg !== 'object' || msg === null) {
			dbg('handleMessage rejected — not an object', msg);
			return;
		}
		const m = msg as {
			type?: unknown;
			userId?: unknown;
			displayName?: unknown;
			expiresAt?: unknown;
			threadId?: unknown;
		};

		if (
			m.type === 'typing' &&
			typeof m.userId === 'string' &&
			typeof m.displayName === 'string' &&
			typeof m.expiresAt === 'number'
		) {
			const threadId = typeof m.threadId === 'string' ? m.threadId : 'world';
			// Ignore the server-stamped m.expiresAt for timing — it's on
			// the Worker's clock. Expiry is local-clock relative.
			const localExpiresAt = Date.now() + CLIENT_TTL_MS;
			const entry: TypingEntry = {
				displayName: m.displayName,
				expiresAt: localExpiresAt,
				threadId
			};
			dbg('handleMessage type=typing → map.set', {
				userId: m.userId,
				displayName: m.displayName,
				threadId,
				expiresIn: CLIENT_TTL_MS,
				serverSkewMs: Date.now() - m.expiresAt
			});
			map.update((cur) => {
				const next = new Map(cur);
				next.set(m.userId as string, entry);
				dbg('map after typing add', { size: next.size, keys: Array.from(next.keys()) });
				return next;
			});
			return;
		}

		if (m.type === 'leave' && typeof m.userId === 'string') {
			dbg('handleMessage type=leave', { userId: m.userId });
			map.update((cur) => {
				if (!cur.has(m.userId as string)) {
					dbg('leave ignored — userId not in map');
					return cur;
				}
				const next = new Map(cur);
				next.delete(m.userId as string);
				dbg('map after leave', { size: next.size, keys: Array.from(next.keys()) });
				return next;
			});
			return;
		}

		dbg('handleMessage rejected — unknown shape', m);
	}

	function prune() {
		const now = Date.now();
		map.update((cur) => {
			let changed = false;
			const next = new Map<string, TypingEntry>();
			for (const [k, v] of cur) {
				if (v.expiresAt > now) next.set(k, v);
				else changed = true;
			}
			if (changed) {
				dbg('prune removed expired entries', {
					before: cur.size,
					after: next.size,
					remaining: Array.from(next.keys())
				});
			}
			return changed ? next : cur;
		});
	}

	function notifyTyping(threadId: string): boolean {
		if (disposed) {
			dbg('notifyTyping() → false (disposed)', { threadId });
			return false;
		}
		const now = Date.now();
		const sinceLast = now - lastSentAt;
		if (sinceLast < THROTTLE_MS) {
			dbg('notifyTyping() → false (throttled)', { threadId, sinceLast, throttleMs: THROTTLE_MS });
			return false;
		}
		if (socket?.readyState !== WebSocket.OPEN) {
			dbg('notifyTyping() → false (socket not OPEN)', { threadId, readyState: socket?.readyState });
			return false;
		}
		const payload = JSON.stringify({ type: 'typing', threadId });
		dbg('notifyTyping() → SEND', { payload, readyState: socket.readyState });
		socket.send(payload);
		lastSentAt = now;
		return true;
	}

	function disconnect() {
		if (disposed) {
			dbg('disconnect() skipped — already disposed');
			return;
		}
		dbg('disconnect() entry');
		disposed = true;
		clearInterval(pruneTimer);
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (socket) {
			try {
				socket.close(1000, 'client done');
				dbg('disconnect() socket.close() invoked');
			} catch (err) {
				dbg('disconnect() socket.close() threw', String(err));
			}
			socket = null;
		}
		map.set(new Map());
	}

	return { typingUsers, notifyTyping, disconnect };
}

function wsUrl(roomId: string, devIdentity?: DevIdentity | null): string {
	const base = env.PUBLIC_TYPING_WS_BASE?.trim();
	let raw: string;
	if (base) {
		const wsBase = base.replace(/^http/, 'ws').replace(/\/+$/, '');
		raw = `${wsBase}/ws/${encodeURIComponent(roomId)}`;
	} else {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		raw = `${proto}//${location.host}/ws/${encodeURIComponent(roomId)}`;
	}
	if (devIdentity) {
		const qs = new URLSearchParams({
			userId: devIdentity.userId,
			displayName: devIdentity.displayName
		});
		raw += `?${qs.toString()}`;
	}
	return raw;
}
