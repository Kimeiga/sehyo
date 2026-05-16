#!/usr/bin/env node
// Forum typing-indicator relay regression test.
//
// Connects two WebSocket clients to the sehyo-typing Worker's
// ForumRoom Durable Object, has A send a "typing" frame, and asserts
// B receives the broadcast with A's identity — then asserts the
// "leave" broadcast fires when A disconnects.
//
// Targets the LOCAL dev worker by default (ws://localhost:8787),
// which has a dev-mode bypass: identity comes from ?userId &
// ?displayName query params instead of a session cookie. Production
// (wss://typing.sehyo.com) requires a real better-auth cookie and so
// can't be driven headless this way — this test covers the relay
// logic, which is identity-independent.
//
// Usage:
//   1. cd workers/typing && npx wrangler dev   # :8787
//   2. node tests/typing-e2e.mjs
//   (or: npm run test:typing)
//
// Override the target:
//   TYPING_WS_BASE=ws://localhost:8787 node tests/typing-e2e.mjs

const BASE = (process.env.TYPING_WS_BASE || 'ws://localhost:8787').replace(/\/+$/, '');
const ROOM = process.env.TYPING_ROOM || 'forum';
const url = (userId, displayName) =>
	`${BASE}/ws/${ROOM}?userId=${encodeURIComponent(userId)}&displayName=${encodeURIComponent(displayName)}`;

let failures = 0;
const ok = (cond, msg) => {
	console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
	if (!cond) failures++;
};

function client(label, userId, displayName) {
	const ws = new WebSocket(url(userId, displayName));
	ws.addEventListener('error', () => console.log(`[${label}] socket error`));
	return ws;
}

const ready = (ws) =>
	new Promise((res, rej) => {
		if (ws.readyState === 1) return res();
		ws.addEventListener('open', res);
		ws.addEventListener('error', () => rej(new Error('ws error before open')));
		setTimeout(() => rej(new Error(`${BASE} did not open within 8s`)), 8000);
	});

const a = client('A', 'alice', 'Alice');
const b = client('B', 'bob', 'Bob');

const inbound = [];
b.addEventListener('message', (e) => {
	try {
		inbound.push(JSON.parse(e.data));
	} catch {
		/* ignore non-JSON */
	}
});

try {
	await Promise.all([ready(a), ready(b)]);
	ok(true, 'both clients connected');

	a.send(JSON.stringify({ type: 'typing', threadId: 'world' }));
	await new Promise((r) => setTimeout(r, 1500));

	const typing = inbound.find((m) => m.type === 'typing');
	ok(!!typing, 'B received a typing broadcast');
	if (typing) {
		ok(typing.userId === 'alice', `typing.userId is alice (got ${typing.userId})`);
		ok(typing.displayName === 'Alice', `typing.displayName is Alice (got ${typing.displayName})`);
		ok(typing.threadId === 'world', `typing.threadId is world (got ${typing.threadId})`);
		ok(typeof typing.expiresAt === 'number', 'typing.expiresAt is a number');
	}

	// Self should not be echoed back to the sender.
	const selfEcho = [];
	a.addEventListener('message', (e) => selfEcho.push(e.data));
	a.send(JSON.stringify({ type: 'typing', threadId: 'world' }));
	await new Promise((r) => setTimeout(r, 800));
	ok(selfEcho.length === 0, 'sender does not receive its own typing echo');

	// Leave broadcast on disconnect.
	a.close(1000, 'done');
	await new Promise((r) => setTimeout(r, 1500));
	const leave = inbound.find((m) => m.type === 'leave' && m.userId === 'alice');
	ok(!!leave, 'B received leave broadcast after A disconnected');

	b.close();
} catch (err) {
	console.log(`FAIL: ${err.message}`);
	failures++;
}

console.log(failures === 0 ? '\nAll typing relay checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
