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
import { Agent as UndiciAgent } from 'undici';

// Some Workers AI models (70B, 120B, reasoning models) take >60s to
// complete the full prompt+answers+comments pipeline. Default undici
// headers timeout kills the request. Bump to 5 min.
const dispatcher = new UndiciAgent({
	headersTimeout: 300_000,
	bodyTimeout: 300_000,
	connectTimeout: 30_000
});

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

// Curated from the live Workers AI catalog
// (https://developers.cloudflare.com/workers-ai/models/). Skipping
// code/math/SQL/vision/safety/tiny models — only conversational
// chat-tuned models in the running for "interesting + human-like"
// persona writing.
const MODELS = [
	// === Established baseline ===
	{ id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B fp8 (current)' },
	{ id: '@cf/meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B (non-fp8)' },
	{ id: '@cf/meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B' },
	{ id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },

	// === Newest / "interesting" frontier ===
	{ id: '@cf/moonshotai/kimi-k2.6', label: 'Kimi K2.6 (Moonshot)' },
	{ id: '@cf/moonshotai/kimi-k2.5', label: 'Kimi K2.5 (Moonshot)' },
	{ id: '@cf/nvidia/nemotron-3-120b-a12b', label: 'Nemotron 3 120B (NVIDIA)' },
	{ id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B IT' },
	{ id: '@cf/google/gemma-3-12b-it', label: 'Gemma 3 12B IT' },
	{ id: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen 3 30B fp8' },
	{ id: '@cf/openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
	{ id: '@cf/mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1 24B' },
	{ id: '@cf/ibm-granite/granite-4.0-h-micro', label: 'Granite 4.0 H Micro (IBM)' },

	// === Reasoning models — output includes <think>...</think> blocks ===
	{ id: '@cf/qwen/qwq-32b', label: 'QwQ 32B (reasoning)' },
	{ id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', label: 'DeepSeek R1 distill Qwen 32B' }

	// (Removed: @cf/zhipuai/glm-4.7-flash — wrong namespace, model not found.
	//  Removed: @hf/nousresearch/hermes-2-pro-mistral-7b — TGI caps max_new_tokens at 1024.
	//  Removed: @hf/thebloke/zephyr-7b-beta-awq — deprecated 2025-10-01.
	//  Removed: @hf/thebloke/openhermes-2.5-mistral-7b-awq — deprecated 2025-10-01.)
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
			body: JSON.stringify({ prompt: PROMPT }),
			dispatcher
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
