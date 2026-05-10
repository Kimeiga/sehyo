#!/usr/bin/env node
// Two-user messaging E2E regression test.
//
// Boot the dev server (npm run dev) in another terminal first, then run:
//   node tests/messages-e2e.mjs            (auto-detects port 5173-5180)
//   PORT=5174 node tests/messages-e2e.mjs  (or pin a port)
//
// What this exercises:
//   1. Anonymous sign-in for two distinct users (A, B).
//   2. A → B send + B's GET delta poll picks it up.
//   3. A pings typing → B's GET surfaces other_typing=true.
//   4. Typing freshness expiry: after TYPING_FRESH_SECONDS the
//      indicator flips back to false on its own.
//   5. B's reading marks A's outgoing messages read → A's GET
//      (peek) returns read_at populated.
//   6. B → A reply round-trip.
//
// Pure fetch — no Playwright dependency. Doesn't exercise the
// polling cadence or UI rendering; for that, ask Claude to run
// the chrome-devtools MCP test described in tests/MESSAGES_E2E.md.

import { setTimeout as sleep } from 'node:timers/promises';

const TYPING_FRESH_SECONDS = 8;

async function detectPort() {
	if (process.env.PORT) return Number(process.env.PORT);
	// Probe the anonymous sign-in route directly with a HEAD-equivalent
	// (POST with empty body); only the actual Sehyo dev server returns
	// 200 here, so we don't false-positive on some other thing
	// listening on 5173.
	for (const p of [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180]) {
		try {
			const r = await fetch(`http://localhost:${p}/api/auth/sign-in/anonymous`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}',
				signal: AbortSignal.timeout(800)
			});
			if (r.ok) return p;
		} catch {
			/* try next */
		}
	}
	throw new Error('Dev server not reachable on common ports — run `npm run dev` first.');
}

class Session {
	constructor(base) {
		this.base = base;
		this.cookies = {};
		this.user = null;
	}
	#cookieHeader() {
		return Object.entries(this.cookies)
			.map(([k, v]) => `${k}=${v}`)
			.join('; ');
	}
	#absorbSetCookie(res) {
		const raw = res.headers.getSetCookie?.() ?? [];
		for (const sc of raw) {
			const first = sc.split(';')[0];
			const [name, ...rest] = first.split('=');
			this.cookies[name.trim()] = rest.join('=').trim();
		}
	}
	async fetch(path, init = {}) {
		const headers = { ...(init.headers ?? {}) };
		const cookie = this.#cookieHeader();
		if (cookie) headers.Cookie = cookie;
		const res = await fetch(`${this.base}${path}`, { ...init, headers });
		this.#absorbSetCookie(res);
		return res;
	}
	async signInAnonymous() {
		const res = await this.fetch('/api/auth/sign-in/anonymous', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		if (!res.ok) throw new Error(`anonymous sign-in failed: ${res.status}`);
		const body = await res.json();
		this.user = body.user;
		return this.user;
	}
}

let passed = 0;
let failed = 0;
function assert(cond, message) {
	if (cond) {
		console.log(`  ✓ ${message}`);
		passed++;
	} else {
		console.error(`  ✗ ${message}`);
		failed++;
	}
}

async function main() {
	const port = await detectPort();
	const base = `http://localhost:${port}`;
	console.log(`→ dev server: ${base}`);

	const A = new Session(base);
	const B = new Session(base);

	console.log('\n[1] Anonymous sign-in for two users');
	await A.signInAnonymous();
	await B.signInAnonymous();
	assert(A.user?.id && B.user?.id, 'both users got ids');
	assert(A.user.id !== B.user.id, 'ids are distinct');
	console.log(`  A = ${A.user.name} (${A.user.id})`);
	console.log(`  B = ${B.user.name} (${B.user.id})`);

	console.log('\n[2] A sends message to B');
	const sendRes = await A.fetch('/api/messages/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ recipient_id: B.user.id, content: 'hello from A' })
	});
	assert(sendRes.ok, `send returned ${sendRes.status}`);
	const sentBody = await sendRes.json();
	assert(sentBody.message?.content === 'hello from A', 'server echoes content');
	assert(sentBody.message?.read_at === null, 'newly sent message is unread');

	console.log('\n[3] B fetches messages — sees A’s message');
	const bGet = await B.fetch(`/api/messages/${A.user.id}`);
	assert(bGet.ok, `B GET returned ${bGet.status}`);
	const bBody = await bGet.json();
	assert(
		(bBody.messages ?? []).some((m) => m.content === 'hello from A'),
		'B sees the message in the conversation'
	);

	console.log('\n[4] B fetching marks message read on A’s side');
	// loadMessages without ?peek=1 marks incoming as read.
	const aPeek = await A.fetch(`/api/messages/${B.user.id}?peek=1`);
	const aPeekBody = await aPeek.json();
	const aOwn = (aPeekBody.messages ?? []).find((m) => m.content === 'hello from A');
	assert(!!aOwn, 'A still sees their own outgoing message');
	assert(typeof aOwn?.read_at === 'number' && aOwn.read_at > 0, 'read_at is now populated');

	console.log('\n[5] Typing indicator: A pings → B sees other_typing=true');
	await A.fetch('/api/messages/typing', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ recipient_id: B.user.id })
	});
	const bAfterPing = await B.fetch(`/api/messages/${A.user.id}?peek=1`);
	const bAfterPingBody = await bAfterPing.json();
	assert(bAfterPingBody.other_typing === true, 'B sees A as typing within freshness window');

	console.log(`\n[6] Typing expires after ${TYPING_FRESH_SECONDS}s`);
	await sleep((TYPING_FRESH_SECONDS + 1) * 1000);
	const bAfterExpiry = await B.fetch(`/api/messages/${A.user.id}?peek=1`);
	const bAfterExpiryBody = await bAfterExpiry.json();
	assert(bAfterExpiryBody.other_typing === false, 'typing flips back to false past freshness');

	console.log('\n[7] B replies → A sees B’s message');
	const bSend = await B.fetch('/api/messages/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ recipient_id: A.user.id, content: 'hi back from B' })
	});
	assert(bSend.ok, `B send returned ${bSend.status}`);
	const aFinal = await A.fetch(`/api/messages/${B.user.id}`);
	const aFinalBody = await aFinal.json();
	assert(
		(aFinalBody.messages ?? []).some((m) => m.content === 'hi back from B'),
		'A sees B’s reply'
	);

	console.log('\n[8] Delta polling: ?since=<lastTs> returns only newer rows');
	const watermark = Math.max(...aFinalBody.messages.map((m) => m.created_at));
	const delta = await A.fetch(`/api/messages/${B.user.id}?since=${watermark}&peek=1`);
	const deltaBody = await delta.json();
	assert(
		(deltaBody.messages ?? []).length === 0,
		'no messages newer than watermark'
	);

	console.log('\n──────────────────────────');
	console.log(`Passed: ${passed}   Failed: ${failed}`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('\nTest crashed:', err);
	process.exit(2);
});
