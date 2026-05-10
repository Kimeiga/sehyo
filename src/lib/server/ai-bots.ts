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

function answersSystemPrompt(authors: SeedAuthor[]) {
	const n = authors.length;
	const roster = authors
		.map((a, i) => `${i + 1}. ${a.name} — ${a.personality ?? 'no specific personality'}`)
		.join('\n');

	return `You are simulating ${n} different anonymous people typing answers on a daily-question forum. Each line of output is ONE PERSON'S OWN answer, in their first-person voice.

ROSTER (in order — line N comes from person N):
${roster}

CRITICAL RULES:
- Write each answer FIRST PERSON, as the person themselves typing. NEVER use third-person narration ("X said with a smile", "X shrugged", "X mused"). NO action tags, NO dialogue tags, NO scene-setting, NO mention of the person's own name. Just the words they would type.
- Output exactly ${n} lines. Line 1 = person 1's answer, line 2 = person 2's answer, etc. No numbering, no labels, no name prefixes, no quote marks around the answers, no markdown.
- Personality should flavor the voice (a deadpan person sounds different from a contrarian one) but the actual content of the answers must still be DISTINCT — different angles, different points.
- Keep it safe-for-work. No vulgarity, no slurs, no NSFW references.

STYLE VARIANCE across the ${n} lines (deliberately mix these — do not make them all the same):
- Most short (5-15 words). 1 or 2 longer (30-60 words) with more thought or a small personal anecdote. Some can be a fragment.
- Some lowercase-first ("i think it's fine"), some properly capitalized.
- Some ending in a period, some not, some trailing off with "...".
- Contractions without apostrophes occasionally ("dont", "its", "wont").
- The occasional very short reply ("idk", "couldnt tell ya").
- Avoid: clichés, motivational lines, hashtags, emoji, quotation marks, every line starting with "I think" / "Honestly" / "Actually".

Example. Roster: "1. Calixto — contrarian; 2. Aurelio — self-deprecating; 3. Idony — sidesteps with humor."
Question: "How do you handle stress?"
Correct output (3 lines, no narration, first person):
the framing is wrong. you dont handle stress, you reorganize your life so it doesnt show up
ha, im clearly the wrong person to ask. mine has health insurance now
couldnt tell ya, mine is currently undefeated

Now produce exactly ${n} first-person answers for the actual question, matched to the roster above. Output nothing but the ${n} answer lines.`;
}

export interface SeedAuthor {
	user_id: string;
	bot_id: string;
	name: string;
	personality: string | null;
}

export async function getSeedAuthors(db: D1Database): Promise<SeedAuthor[]> {
	// Personality is purely LLM-side guidance and lives on bot_profiles
	// (not on the public user.bio, which now holds a normal-person bio).
	const rows = await db
		.prepare(
			`SELECT u.id AS user_id, u.bot_id, u.name, bp.personality
			 FROM user u
			 LEFT JOIN bot_profiles bp ON bp.user_id = u.id
			 WHERE u.bot_id LIKE 'seed_%'`
		)
		.all<{ user_id: string; bot_id: string; name: string; personality: string | null }>();
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

export async function generateSeedAnswers(
	ai: Ai,
	promptText: string,
	authors: SeedAuthor[]
): Promise<string[]> {
	const res = (await ai.run(ANSWERS_MODEL, {
		messages: [
			{ role: 'system', content: answersSystemPrompt(authors) },
			{ role: 'user', content: promptText }
		],
		temperature: 0.95,
		max_tokens: 900
	})) as { response?: string };
	const raw = res.response ?? '';
	return splitAnswers(raw, authors.length);
}

function splitAnswers(raw: string, n: number): string[] {
	const lines = raw
		.split(/\r?\n/)
		.map((l) => cleanLine(l))
		.filter((l) => l.length > 0 && l.length <= 500);
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
	// Strip leading "Name: " labels the model sometimes adds despite
	// being told not to (e.g. "Aurelio: idk").
	out = out.replace(/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)?[:.\-—]\s*/, '');
	// Strip trailing third-person dialogue / action tags. The model
	// sometimes appends ", Aurelio said with a smile." or
	// " Aoife shrugged." despite the first-person rule.
	out = out.replace(
		/[\s,]+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+(?:said|asked|added|noted|replied|whispered|shrugged|laughed|smiled|chuckled|sighed|mused|quipped|hinted|argued|retorted|insisted|observed|continued|interjected|countered)\b[^.?!]*[.?!]?\s*$/i,
		''
	);
	out = out.trim();
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
	const picked = shuffle(authors).slice(0, n);
	const answers = await generateSeedAnswers(ai, promptText, picked);

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
