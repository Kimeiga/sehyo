import type { D1Database, Ai } from '@cloudflare/workers-types';

const PROMPT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const ANSWERS_MODEL = '@cf/meta/llama-3.1-8b-instruct';

// Number of seed answers to generate per prompt. Stays small so the feed
// doesn't look bot-flooded; real human posts mix in over the day.
const ANSWER_COUNT = 8;

const PROMPT_GENERATION_SYSTEM = `You generate a single short question for a daily-question social platform called Sehyo.

Constraints:
- One sentence ending in a question mark.
- Personal, opinion-shaped, conversation-starting. The average person should immediately have an answer.
- Avoid generic ("what makes you happy?") and avoid current-events/political.
- Avoid topics with obvious "right" answers.
- 6-18 words.
- No quotation marks. No preamble. Output ONLY the question.`;

const PROMPT_GENERATION_USER = 'Give me today\'s question.';

function answersSystemPrompt(n: number) {
	return `Generate exactly ${n} short answers to a daily-question forum prompt, as if written by ${n} different anonymous people typing on their phones.

Each answer is ONE sentence, 6-22 words. Mix tones across the ${n} answers: some sincere and thoughtful, some funny and self-deprecating, some contrarian, some that sidestep the question with humor or admission of inexperience. Avoid clichés, motivational lines, hashtags, emoji, and quotation marks.

Output format: ${n} lines total, one answer per line, no numbering, no bullets, no labels, no quotes.

Example for "How do you handle stress?":
deep breaths and aggressively ignoring my email
i don't really, i just absorb it like a sponge
go for a walk, even though i hate walking
stress doesn't go away, you just upgrade your tolerance for it
my dog handles it for me, somehow
why are you asking me, clearly i'm stressed
control what you can, accept the rest, scream into a pillow occasionally
sometimes i stare at the ceiling for an hour and call that a strategy

Now produce exactly ${n} answers for the actual question, in that format.`;
}

export interface SeedAuthor {
	user_id: string;
	bot_id: string;
	name: string;
}

export async function getSeedAuthors(db: D1Database): Promise<SeedAuthor[]> {
	const rows = await db
		.prepare(`SELECT id AS user_id, bot_id, name FROM user WHERE bot_id LIKE 'seed_%'`)
		.all<{ user_id: string; bot_id: string; name: string }>();
	return rows.results ?? [];
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
	return cleanLine(res.response ?? '');
}

export async function generateSeedAnswers(ai: Ai, promptText: string, n: number): Promise<string[]> {
	const res = (await ai.run(ANSWERS_MODEL, {
		messages: [
			{ role: 'system', content: answersSystemPrompt(n) },
			{ role: 'user', content: promptText }
		],
		temperature: 0.95,
		max_tokens: 800
	})) as { response?: string };
	const raw = res.response ?? '';
	return splitAnswers(raw, n);
}

function splitAnswers(raw: string, n: number): string[] {
	const lines = raw
		.split(/\r?\n/)
		.map((l) => cleanLine(l))
		.filter((l) => l.length > 0 && l.length <= 240);
	// If the model returned more than n, take the first n. If fewer, return what we have.
	return lines.slice(0, n);
}

function cleanLine(s: string): string {
	let out = s.trim();
	// Strip leading numbering / bullets the model sometimes adds.
	out = out.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '');
	// Strip wrapping quotes.
	if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith('“') && out.endsWith('”'))) {
		out = out.slice(1, -1).trim();
	}
	// Strip leading "Answer:" / "Response:" labels.
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

function shuffle<T>(arr: T[]): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/**
 * Pick (or generate) today's prompt and seed it with N short answers, each
 * attributed to a different randomly-chosen seed author. Idempotent on the
 * active_date — if today's prompt already exists this returns it without
 * regenerating.
 */
export async function rotatePromptIfNeeded(db: D1Database, ai: Ai): Promise<{
	prompt_id: string;
	prompt_text: string;
	created: boolean;
	answers_inserted: number;
}> {
	const date = todayUTC();

	const existing = await db
		.prepare('SELECT id, prompt_text FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string; prompt_text: string }>();

	if (existing) {
		return { prompt_id: existing.id, prompt_text: existing.prompt_text, created: false, answers_inserted: 0 };
	}

	const promptText = await generatePromptText(ai);
	const promptId = crypto.randomUUID();

	await db
		.prepare(`INSERT INTO daily_prompts (id, prompt_text, active_date) VALUES (?, ?, ?)`)
		.bind(promptId, promptText, date)
		.run();

	const authors = await getSeedAuthors(db);
	const n = Math.min(ANSWER_COUNT, authors.length);
	const answers = await generateSeedAnswers(ai, promptText, n);
	const picked = shuffle(authors).slice(0, answers.length);

	let inserted = 0;
	for (let i = 0; i < answers.length; i++) {
		const a = answers[i];
		const author = picked[i];
		if (!a || !author) continue;
		try {
			const postId = crypto.randomUUID();
			await db
				.prepare(`INSERT INTO posts (id, user_id, prompt_id, content) VALUES (?, ?, ?, ?)`)
				.bind(postId, author.user_id, promptId, a)
				.run();
			inserted++;
		} catch (err) {
			console.error('Seed insert failed for', author.name, err);
		}
	}

	return { prompt_id: promptId, prompt_text: promptText, created: true, answers_inserted: inserted };
}
