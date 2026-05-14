import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Ai } from '@cloudflare/workers-types';
import {
	getSeedAuthors,
	generatePromptText,
	generateAnswerLines,
	DEFAULT_MODEL,
	type SeedAuthor
} from '$lib/server/ai-bots';

/**
 * Read-only model-comparison harness. Runs the full bot-content
 * pipeline against a chosen Workers AI model and returns the
 * output as JSON WITHOUT writing to D1. Use this to A/B different
 * models side-by-side before flipping the production default.
 *
 *   POST /api/admin/test-model?model=<workers-ai-id>
 *   Header: x-admin-secret: $ADMIN_SECRET
 *   Body:   { prompt?: string }  // optional override; otherwise generated
 *
 * Returns:
 *   {
 *     model, prompt, answers: [{author, text}, ...],
 *     interbot_comments: [{commenter, parent_author, parent_text, text}],
 *     latency_ms, error?: string
 *   }
 *
 * Use scripts/compare-models.mjs to drive this against each
 * candidate and dump per-model markdown for visual comparison.
 */

interface CommentSlot {
	commenter: SeedAuthor;
	parentAuthorName: string;
	parentText: string;
	isNested?: boolean;
}

// Local copy of ai-bots.ts's extractModelText so the test endpoint
// handles all the same response shapes (Llama-style { response },
// OpenAI chat-completion-style { choices[0].message.content }, +
// <think>...</think> stripping for reasoning models).
function extractText(res: unknown): string {
	if (!res || typeof res !== 'object') return '';
	const r = res as Record<string, unknown>;
	let text = '';
	if (typeof r.response === 'string') {
		text = r.response;
	} else {
		const choices = (r.choices as Array<{ message?: Record<string, unknown> }> | undefined) ?? [];
		const message = choices[0]?.message ?? {};
		if (typeof message.content === 'string' && message.content.length > 0) {
			text = message.content;
		} else if (typeof message.reasoning_content === 'string') {
			text = message.reasoning_content;
		} else if (typeof message.reasoning === 'string') {
			text = message.reasoning;
		}
	}
	text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
	if (text.startsWith('<think>')) {
		const idx = text.indexOf('\n\n');
		if (idx > 0) text = text.slice(idx + 2).trim();
	}
	return text;
}

// Inlined batched-comment helper (the production one in ai-bots.ts
// is internal). Identical prompt + parsing logic.
async function generateBatchedComments(
	ai: Ai,
	slots: CommentSlot[],
	model: string
): Promise<(string | null)[]> {
	if (slots.length === 0) return [];

	const slotBlock = slots
		.map((s, i) => {
			const persona = s.commenter.personality ?? 'no specific personality';
			const parentKind = s.isNested ? 'comment' : 'post';
			return `=== SLOT ${i + 1} ===
Voice: ${s.commenter.name} — ${persona}
Replying to ${s.parentAuthorName}'s ${parentKind}: "${s.parentText.replace(/"/g, "'")}"`;
		})
		.join('\n\n');

	const system = `You are simulating a daily-question forum's comment thread. For each numbered SLOT below, write ONE short reply in that voice's first-person register.

Constraints applied to EVERY slot:
- 3 to 22 words per comment (most should be on the shorter side).
- Plain prose. No quotation marks around your reply, no name labels, no markdown, no narration, no emoji, no hashtags.
- React to what was said. Be conversational, not summarizing.
- Match the messy register of a forum: occasional missing apostrophes ok, lowercase fine, fragments fine.
- DO NOT close on a profound flourish, metaphor, or "X not Y" construction.

═══ CRITICAL: VARIETY ACROSS THE BATCH ═══

You are writing ALL slots in one pass. You will SEE the comments you write for earlier slots before writing later ones. Use that visibility:

- NEVER repeat the SAME OPENING across slots ("same here", "got X too", "same thing happened", "honestly", "i mean"). If you've used an opening, pick something different for the next.
- NEVER repeat the SAME ANECDOTE TRIGGER ("my grandma", "got lost in the woods"). One memory hook is fine; a SECOND slot riffing on the same one is forbidden.
- Mix reply STRATEGIES: agreement, pushback, tangent, dry one-liner, @-reply, follow-up question. Don't write 4 agreements in a row.
- Mix LENGTHS: short (3-6 words), medium (8-15 words), occasional longer (15-22 words).

Output exactly ${slots.length} lines, one per slot, in order. No numbering, no labels, no quotes, no blank lines.`;

	const res = await ai.run(model, {
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: slotBlock }
		],
		temperature: 0.92,
		max_tokens: 1800
	});

	const text = extractText(res);
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && l.length <= 350);

	const out: (string | null)[] = new Array(slots.length).fill(null);
	for (let i = 0; i < Math.min(lines.length, slots.length); i++) {
		out[i] = lines[i] ?? null;
	}
	return out;
}

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const secret = request.headers.get('x-admin-secret');
	const env = platform?.env;
	if (!env || !env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
		throw error(401, 'Unauthorized');
	}
	if (!env.DB || !env.AI) {
		throw error(500, 'Bindings missing');
	}

	const model = url.searchParams.get('model') || DEFAULT_MODEL;
	const body = (await request.json().catch(() => ({}))) as { prompt?: string };

	const started = Date.now();
	try {
		// 1. Prompt (generate if not provided)
		const promptText = body.prompt
			? body.prompt
			: await generatePromptText(env.AI, [], model);

		// 2. Seed authors + pick 10
		const allAuthors = await getSeedAuthors(env.DB);
		const picked = allAuthors.slice(0, 10);

		// 3. Answers
		const answerLines = await generateAnswerLines(env.AI, promptText, picked, model);
		const answers = picked.map((a, i) => ({
			author: a.name,
			personality: a.personality,
			text: answerLines[i] ?? null
		}));

		// 4. 8 inter-bot comments (batched)
		const interbotSlots: CommentSlot[] = [];
		for (let i = 0; i < 8; i++) {
			const targetIdx = i % picked.length;
			const target = picked[targetIdx];
			const targetAnswer = answerLines[targetIdx];
			if (!target || !targetAnswer) continue;
			const candidates = allAuthors.filter((a) => a.user_id !== target.user_id);
			const commenter = candidates[(i * 7) % candidates.length];
			if (!commenter) continue;
			interbotSlots.push({
				commenter,
				parentAuthorName: target.name,
				parentText: targetAnswer
			});
		}
		const interbotTexts = await generateBatchedComments(env.AI, interbotSlots, model);
		const interbot_comments = interbotSlots.map((s, i) => ({
			commenter: s.commenter.name,
			parent_author: s.parentAuthorName,
			parent_text: s.parentText,
			text: interbotTexts[i]
		}));

		return json({
			model,
			prompt: promptText,
			answers,
			interbot_comments,
			latency_ms: Date.now() - started
		});
	} catch (err) {
		console.error('test-model failed:', err);
		return json(
			{
				model,
				error: String(err),
				latency_ms: Date.now() - started
			},
			{ status: 500 }
		);
	}
};
