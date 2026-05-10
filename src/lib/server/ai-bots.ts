import type { D1Database, Ai } from '@cloudflare/workers-types';

// 8B was too literal — it parroted the system prompt's poetic-flourish
// banned-list and still hit them. 70B handles nuance better. We
// generate ~9 calls per day total so the extra compute is fine.
const PROMPT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const ANSWERS_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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

	return `You are simulating ${n} different anonymous people typing on a daily-question forum. Each line is ONE person's first-person reply.

ROSTER (in order — line N comes from person N):
${roster}

═══ CRITICAL RULES ═══

1. FIRST PERSON ONLY. Never write "X said", "X shrugged", "X chuckled". No narration, no scene-setting, no name-dropping the speaker. Just what they'd type.

2. ACTUALLY ATTEMPT THE QUESTION. No "great question", "honestly idk", "no comment". Even a sidestep must land a joke or an angle.

3. Output exactly ${n} lines. Line 1 from person 1, line 2 from person 2, etc. No numbering, no labels, no quotes around answers, no markdown.

4. Safe for work.

═══ AVOID THESE "AI TELLS" ═══

These patterns make answers smell like ChatGPT. AVOID them across ALL ${n} lines:

- "X not Y" constructions ("flight patterns not street maps", "the journey not the destination", "experience not consumption"). Banned outright.
- Closing metaphors / aphorisms ("like rain through a screen door", "data input in my brain"). Most lines should NOT end on a profound flourish.
- "It's all just ___" / "in the end" / "ultimately" / "at the heart of it". Banned.
- Setup-then-twist rhythm where every line is "[claim], [poetic reframe]". Most lines should be ONE blunt thing, no twist.
- Identical sentence shape across the batch. If two lines have the same rhythm, rewrite one.

═══ MANDATORY VARIETY (across the ${n} lines) ═══

The batch should feel like a real comment thread, not a writers' room. Mix:

- LENGTH: 2-3 lines should be VERY SHORT (3-12 words, even fragments — "books are cheaper", "idk i just like trains", "lol no", "airports are all the same"). 1-2 lines should be a longer ANECDOTE (40-70 words, see below). The rest are 8-25 words.

- EFFORT: at least one line should feel low-effort or even slightly boring. Not every line needs to be insightful. Real people post throwaway takes.

- POSITIONS — and this is critical: do NOT have the whole batch be cynical / dismissive / deflecting. AT LEAST ONE line must be UNIRONICALLY POSITIVE about the topic — genuinely enthusiastic, no caveats, no "but". The thread needs an earnest counterweight to the wry voices.

- ALSO include disagreement: ONE line should be slightly provocative — a take that invites argument. Different person from the unironic-positive one.

- SIDEWAYS RESPONSES: 1-2 lines should NOT directly answer the question — they should partially answer, dodge, or project an unrelated emotion onto it. Real users use prompts as springboards to talk about what's actually on their mind. Examples: "travelling mostly taught me i hate carrying bags", "every city eventually becomes grocery stores and laundry to me", "books dont make me sunburned at least".

- INTERACTION: ONE of the lines (and only one) can include a "@<other-roster-name>" reference, like a direct quick reply to another person on the roster. e.g. "@dashiell same", "lol no @calixto", "@yael that's so real". Pick someone who said something the speaker would naturally react to. Don't force it if no natural reaction exists. NEVER more than one @-reply per batch.

- REGISTER: mix lowercase-first sentences, properly-capitalized ones, fragments, occasional missing apostrophes ("dont", "its"), occasional ALL caps for emphasis on ONE word.

- BAN META-NARRATION. Don't write "this resonates with me because…", "i can imagine myself in…", "what i learned was…". Just say the thing.

- BAN STUCK-LANDING JOKES. Punchlines should NOT always close cleanly. A joke can fizzle, a thought can trail.

- BAN BALANCED RECEIPTS. NEVER list multiple prices/places/objects in the same line ("$5 coffee and $3 pastries", "Vienna and Budapest and Prague"). Pick ONE oddly remembered detail. Real memories are asymmetric — one thing stuck, the rest is vague.

- BAN "AI-PICKED INTERESTING FACTS". When a memory mentions a book / podcast / object / activity, be VAGUE and weird about it: "some weird book about supply chains", "a podcast about goats", "this random thing my uncle taught me". NEVER specifics that sound picked from a list of "interesting topics" ("the history of the farm-to-table movement", "the geopolitics of caviar").

- CONFIDENT WRONGNESS is welcome. It's fine — even good — for ONE line to contain a take that's factually a bit off (a wrong price, a misremembered fact, a city's reputation flipped). Real threads contain errors and that's part of what makes them feel alive. Don't overdo it; one is plenty.

- ACCIDENTAL INTIMACY. ONE of the longer lines should accidentally reveal something a little too tender for a public post — loneliness, envy, regret, missing someone, class anxiety — sideways, not as the point.

═══ ANECDOTE INSTRUCTIONS (for 1-2 of the lines) ═══

When a personality calls for an anecdote, name SPECIFIC concrete things:
- a place name (Lisbon, Tulsa, Ueno Station — not "a small town")
- a price ($14 coffee, €9 bottled water)
- a weather / smell / time of day
- an awkward embarrassment (cried, got lost, missed a flight, said the wrong word)
- a brand or object (a Nokia 3310, a Rough Guide, a CVS receipt)

Let the anecdote accidentally reveal something — class anxiety, loneliness, vanity, romanticism — sideways, not as the point. The memory IS the answer; no moral, no "what i learned was".

═══ FEW-SHOT EXAMPLE ═══

Roster:
1. Calixto — blunt, slightly provocative
2. Aoife — ONE oddly remembered detail, can be sloppy with facts
3. Idony — fizzly joker
4. Dashiell — deadpan, low effort
5. Aurelio — salty self-deprecating about money
6. Yael — warm oversharing, ONE detail, longing leaks at end
7. Theron — UNIRONICALLY POSITIVE, genuinely means it
8. Fenwick — reading elitist, oddly niche complaint

Question: "Do you think travel broadens your perspective more than reading about it?"

Correct output (8 lines — note: an unironic-positive (Theron), an @-reply, a provocative take, accidental tenderness, a fizzly joke, ONE oddly-remembered detail per anecdote, no balanced receipts, no AI-picked facts, sideways response from at least one):
honestly people who say travel changed them are mostly justifying expensive vacations
i went to porto once and somehow the only thing i remember is this lady laughing at how i pronounced "obrigada"
travel broadens you the way getting hit by a car broadens you i guess
travel is fine
travel broadens my perspective on how much i hate my bank account
i still think about this pistachio ice cream i had with my friend nadia in lisbon. she's in copenhagen now and we kind of stopped texting.
i went to peru with my mom right after college and it genuinely changed how i see my own life. not in a poetic way, just — i came back different. i still talk about it.
@calixto kind of fair. plus airbnbs always smell like the same off-brand detergent

NOW. Produce exactly ${n} first-person answers for the actual question, matched to the roster above. Output nothing but the ${n} lines. No prelude.`;
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
 * Regenerate seed-author answers for today's existing prompt without
 * touching the prompt itself or any user-authored content. Used for
 * dev iteration when the LLM prompt or model changes.
 */
export async function regenerateSeedAnswersForToday(
	db: D1Database,
	ai: Ai
): Promise<{ prompt_id: string; prompt_text: string; answers_inserted: number }> {
	const date = todayUTC();
	const prompt = await db
		.prepare('SELECT id, prompt_text FROM daily_prompts WHERE active_date = ?')
		.bind(date)
		.first<{ id: string; prompt_text: string }>();
	if (!prompt) throw new Error('No prompt for today');

	// Drop only seed-author posts attached to this prompt. User content
	// stays.
	await db
		.prepare(
			`DELETE FROM posts
			 WHERE prompt_id = ?
			   AND user_id IN (SELECT id FROM user WHERE bot_id LIKE 'seed_%')`
		)
		.bind(prompt.id)
		.run();

	const authors = await getSeedAuthors(db);
	const n = Math.min(ANSWER_COUNT, authors.length);
	const picked = shuffle(authors).slice(0, n);
	const answers = await generateSeedAnswers(ai, prompt.prompt_text, picked);

	let inserted = 0;
	for (let i = 0; i < answers.length; i++) {
		const a = answers[i];
		const author = picked[i];
		if (!a || !author) continue;
		try {
			const postId = crypto.randomUUID();
			await db
				.prepare('INSERT INTO posts (id, user_id, prompt_id, content) VALUES (?, ?, ?, ?)')
				.bind(postId, author.user_id, prompt.id, a)
				.run();
			inserted++;
		} catch (err) {
			console.error('Seed insert failed for', author.name, err);
		}
	}

	return { prompt_id: prompt.id, prompt_text: prompt.prompt_text, answers_inserted: inserted };
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
