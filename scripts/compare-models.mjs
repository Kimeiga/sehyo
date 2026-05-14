#!/usr/bin/env node
// Drive /api/admin/test-model against a list of Workers AI models with the
// SAME prompt, dump per-model outputs to tmp/model-comparison/*.md.
//
// Usage:
//   ADMIN_SECRET=... node scripts/compare-models.mjs
//   ADMIN_SECRET=... HOST=https://sehyo.com PROMPT="Your custom question?" node scripts/compare-models.mjs
//
// Defaults to localhost dev server (port 5174). Override HOST for prod.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'tmp', 'model-comparison');

const HOST = process.env.HOST || 'http://localhost:5174';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const PROMPT =
	process.env.PROMPT ||
	'Do you trust your instincts or logic more when making important decisions?';

if (!ADMIN_SECRET) {
	console.error('error: ADMIN_SECRET env var required (matches Pages secret on prod).');
	process.exit(1);
}

const MODELS = [
	{ id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B fp8 (current)' },
	{ id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
	{ id: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
	{ id: '@cf/google/gemma-3-27b-it', label: 'Gemma 3 27B IT' },
	{ id: '@cf/qwen/qwen2.5-coder-32b-instruct', label: 'Qwen 2.5 Coder 32B' }
];

mkdirSync(OUT_DIR, { recursive: true });

function safeSlug(id) {
	return id.replace(/^@cf\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function renderMarkdown(result) {
	const lines = [];
	lines.push(`# ${result.model}`);
	lines.push('');
	lines.push(`Latency: ${result.latency_ms}ms`);
	lines.push('');
	if (result.error) {
		lines.push('## Error');
		lines.push('```');
		lines.push(result.error);
		lines.push('```');
		return lines.join('\n');
	}
	lines.push('## Prompt');
	lines.push('');
	lines.push(`> ${result.prompt}`);
	lines.push('');
	lines.push('## Answers');
	lines.push('');
	for (const a of result.answers ?? []) {
		lines.push(`### ${a.author}`);
		lines.push(`_personality: ${a.personality ?? '—'}_`);
		lines.push('');
		lines.push(a.text ?? '*(missing)*');
		lines.push('');
	}
	lines.push('## Inter-bot Comments');
	lines.push('');
	for (const c of result.interbot_comments ?? []) {
		lines.push(
			`- **${c.commenter}** → _${c.parent_author}_: ${c.text ?? '*(missing)*'}`
		);
	}
	return lines.join('\n');
}

async function runOne(model) {
	console.log(`→ ${model.label}  (${model.id})`);
	const started = Date.now();
	try {
		const res = await fetch(`${HOST}/api/admin/test-model?model=${encodeURIComponent(model.id)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET },
			body: JSON.stringify({ prompt: PROMPT })
		});
		const body = await res.json();
		const md = renderMarkdown(body);
		const filename = join(OUT_DIR, `${safeSlug(model.id)}.md`);
		writeFileSync(filename, md);
		const elapsed = Date.now() - started;
		const errMark = body.error ? ' ✗' : ' ✓';
		console.log(`   ${errMark}  ${elapsed}ms  → ${filename}`);
		return { ...model, ok: !body.error, body };
	} catch (err) {
		console.error(`   ✗ crashed:`, err);
		return { ...model, ok: false, error: String(err) };
	}
}

(async () => {
	const summary = [];
	summary.push(`# Workers AI model comparison`);
	summary.push('');
	summary.push(`Prompt: ${PROMPT}`);
	summary.push(`Host: ${HOST}`);
	summary.push('');
	summary.push('| Model | Status | Latency |');
	summary.push('|---|---|---|');

	for (const model of MODELS) {
		const result = await runOne(model);
		const status = result.ok ? '✓' : '✗ ' + (result.body?.error ?? result.error ?? 'unknown');
		const latency = result.body?.latency_ms ? `${result.body.latency_ms}ms` : '—';
		summary.push(`| [${model.label}](./${safeSlug(model.id)}.md) | ${status} | ${latency} |`);
	}

	writeFileSync(join(OUT_DIR, 'README.md'), summary.join('\n'));
	console.log(`\nDone. Outputs in: ${OUT_DIR}`);
})();
