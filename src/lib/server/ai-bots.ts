import type { D1Database, Ai } from '@cloudflare/workers-types';

const PROMPT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const ANSWER_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const PROMPT_GENERATION_SYSTEM = `You generate a single short question for a daily-question social platform called Sehyo.

Constraints:
- One sentence, ending in a question mark.
- Personal, opinion-shaped, conversation-starting. Reading it should make the average person feel they have an answer.
- Avoid generic ("what makes you happy?") and avoid current-events/political.
- Avoid topics with obvious "right" answers.
- 6-18 words.
- No quotation marks. No preamble. Output only the question.`;

const PROMPT_GENERATION_USER = `Give me today's question.`;

export interface PhilosopherBot {
	user_id: string;
	bot_profile_id: string;
	name: string;
	system_prompt: string;
}

export async function getActivePhilosophers(db: D1Database): Promise<PhilosopherBot[]> {
	const rows = await db
		.prepare(
			`SELECT bp.id AS bot_profile_id, bp.user_id, bp.name, bp.personality
			 FROM bot_profiles bp
			 WHERE bp.is_active = 1`
		)
		.all<{ bot_profile_id: string; user_id: string; name: string; personality: string }>();

	return (rows.results ?? []).flatMap((r) => {
		try {
			const p = JSON.parse(r.personality);
			if (typeof p?.system_prompt !== 'string') return [];
			return [{ user_id: r.user_id, bot_profile_id: r.bot_profile_id, name: r.name, system_prompt: p.system_prompt }];
		} catch {
			return [];
		}
	});
}

export async function generatePromptText(ai: Ai): Promise<string> {
	const res = (await ai.run(PROMPT_MODEL, {
		messages: [
			{ role: 'system', content: PROMPT_GENERATION_SYSTEM },
			{ role: 'user', content: PROMPT_GENERATION_USER }
		],
		temperature: 0.9,
		max_tokens: 80
	})) as { response?: string };
	return cleanModelOutput(res.response ?? '');
}

export async function generateBotAnswer(ai: Ai, bot: PhilosopherBot, promptText: string): Promise<string> {
	const res = (await ai.run(ANSWER_MODEL, {
		messages: [
			{ role: 'system', content: bot.system_prompt },
			{ role: 'user', content: promptText }
		],
		temperature: 0.85,
		max_tokens: 220
	})) as { response?: string };
	return cleanModelOutput(res.response ?? '');
}

function cleanModelOutput(s: string): string {
	let out = s.trim();
	// Strip wrapping quotes the model sometimes adds despite instructions.
	if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith('“') && out.endsWith('”'))) {
		out = out.slice(1, -1).trim();
	}
	// Strip leading "Answer:" / "Response:" labels some models prefix.
	out = out.replace(/^(answer|response)[:.\-]\s*/i, '');
	return out;
}

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pick (or generate) today's prompt and have every active philosopher answer
 * it. Idempotent on the active_date — if today's prompt already exists this
 * returns it without re-generating bot answers.
 */
export async function rotatePromptIfNeeded(db: D1Database, ai: Ai): Promise<{
	prompt_id: string;
	prompt_text: string;
	created: boolean;
	bot_answers_inserted: number;
}> {
	const date = todayUTC();

	const existing = await db
		.prepare('SELECT id, prompt_text FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string; prompt_text: string }>();

	if (existing) {
		return { prompt_id: existing.id, prompt_text: existing.prompt_text, created: false, bot_answers_inserted: 0 };
	}

	const promptText = await generatePromptText(ai);
	const promptId = crypto.randomUUID();

	await db
		.prepare(`INSERT INTO daily_prompts (id, prompt_text, active_date) VALUES (?, ?, ?)`)
		.bind(promptId, promptText, date)
		.run();

	const bots = await getActivePhilosophers(db);

	// Generate sequentially. Workers AI handles its own concurrency caps and a
	// brief stagger keeps per-prompt rate budgets simple.
	let inserted = 0;
	for (const bot of bots) {
		try {
			const answer = await generateBotAnswer(ai, bot, promptText);
			if (!answer) continue;
			const postId = crypto.randomUUID();
			await db
				.prepare(
					`INSERT INTO posts (id, user_id, prompt_id, content)
					 VALUES (?, ?, ?, ?)`
				)
				.bind(postId, bot.user_id, promptId, answer)
				.run();
			inserted++;
		} catch (err) {
			console.error(`Bot ${bot.name} failed to generate:`, err);
		}
	}

	return { prompt_id: promptId, prompt_text: promptText, created: true, bot_answers_inserted: inserted };
}
