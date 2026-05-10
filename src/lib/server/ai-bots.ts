import type { D1Database, Ai } from '@cloudflare/workers-types';

// 8B was too literal — it parroted the system prompt's poetic-flourish
// banned-list and still hit them. 70B handles nuance better. We
// generate ~9 calls per day total so the extra compute is fine.
const PROMPT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const ANSWERS_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Number of seed answers to generate per prompt. With 18 bots in the
// pool, picking 10 per batch gives variety across days while still
// leaving room for human posts.
const ANSWER_COUNT = 10;

// Inter-bot comments generated after the initial answers (Pass 2)
// and nested replies on those (Pass 3). Together they make the
// thread feel inhabited the moment a human visits.
const INTERBOT_COMMENT_COUNT = 8;
const INTERBOT_NESTED_COUNT = 4;

// Bot replies generated on a user's own post when they answer the
// daily prompt — the "guest-preview comments" engagement loop.
const REPLIES_ON_USER_ANSWER = 4;

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

2. ENGAGE WITH THE QUESTION. The MAJORITY of replies (at least ${Math.max(1, Math.floor(n * 0.6))} of ${n}) should give a real, substantive opinion — a position with reasoning behind it, not a one-line gag. Take the question seriously. Have a take. Defend it lightly. Anecdotes are great when they back up the take.

3. Output exactly ${n} lines. Line 1 from person 1, line 2 from person 2, etc. No numbering, no labels, no quotes around answers, no markdown.

4. Safe for work.

═══ AVOID THESE "AI TELLS" ═══

These patterns make answers smell like ChatGPT. AVOID them across ALL ${n} lines:

- "X not Y" constructions ("flight patterns not street maps", "the journey not the destination", "experience not consumption"). Banned outright.
- Closing metaphors / aphorisms ("like rain through a screen door", "data input in my brain"). Lines should usually NOT end on a profound flourish.
- "It's all just ___" / "in the end" / "ultimately" / "at the heart of it". Banned.
- Setup-then-twist rhythm where every line is "[claim], [poetic reframe]".
- Identical sentence shape across the batch. If two lines have the same rhythm, rewrite one.
- LISTICLE energy. No "first… second… third…", no bullet-shaped reasoning. People type, they don't outline.
- "this resonates with me because…", "i can imagine myself in…", "what i learned was…". Banned.

═══ LENGTH MIX (across the ${n} lines) ═══

- ${Math.max(1, Math.floor(n * 0.6))} of ${n} lines should be SUBSTANTIVE: 30-90 words, with a real position or argument. They can use a personal anecdote, but the anecdote SUPPORTS the point — it doesn't replace one. Think: "I think X. Here's a tiny moment that's why I think X." Or: "X, because in my experience Y, and Y kept happening."
- 1-2 lines can be SHORT throwaways (5-15 words, fragments fine — "lol no", "books are cheaper", "airports are all the same"). These are the texture, not the rule.
- 1-2 lines can be SIDEWAYS — partially answer the question, dodge, or project an unrelated emotion onto it. They still need a voice; they're not blank.

Aim for the AVERAGE answer to feel like 50-70 words of someone making an actual argument, not 12 words of a quip.

═══ MANDATORY VARIETY ═══

The batch should feel like a real comment thread, not a writers' room. Mix:

- POSITIONS — critical: do NOT have the whole batch be cynical / dismissive / deflecting. AT LEAST ONE line must be UNIRONICALLY POSITIVE about the topic — genuinely enthusiastic, no caveats, no "but".
- DISAGREEMENT: ONE line should be slightly provocative — a take that invites argument. Different person from the unironic-positive one.
- INTERACTION: ONE of the lines (and only one) can include a "@<other-roster-name>" reference like a direct reply ("@dashiell same", "kind of disagree @calixto"). Skip if no natural reaction exists.
- REGISTER: mix lowercase-first sentences, properly-capitalized ones, fragments, occasional missing apostrophes ("dont", "its"), occasional ALL caps for emphasis on ONE word.
- BAN STUCK-LANDING JOKES. Punchlines should NOT always close cleanly.
- BAN BALANCED RECEIPTS. NEVER list multiple prices/places/objects in the same line ("$5 coffee and $3 pastries", "Vienna and Budapest and Prague"). Pick ONE detail.
- BAN "AI-PICKED INTERESTING FACTS". When a memory mentions a book / podcast / object / activity, be VAGUE and weird about it ("some weird book about supply chains", "a podcast about goats"). NEVER specifics that sound picked from a list of "interesting topics" ("the history of the farm-to-table movement").
- CONFIDENT WRONGNESS is welcome. ONE line can contain a take that's factually a bit off — a wrong price, a misremembered fact, a flipped reputation. Don't overdo it.
- ACCIDENTAL INTIMACY. ONE of the longer lines should accidentally reveal something a little too tender for a public post — loneliness, envy, regret, missing someone, class anxiety — sideways, not as the point.

═══ HOW ANECDOTES WORK HERE ═══

Anecdotes are evidence, not the whole answer. The shape is:
- A position or take stated plainly.
- A specific personal moment that nudged the speaker toward it.
- Optional: how it lingers / what they still notice.

Concrete details should be SPECIFIC but ASYMMETRIC: a place (Lisbon, Tulsa, Ueno Station), a price ($14 coffee, €9 bottled water), a smell, a brand, a weather. Pick ONE detail per memory. The rest stays vague — that's how real memory works.

Do NOT moralize ("what i learned was…"). Let the take + the moment do the work; the reader infers.

═══ FEW-SHOT EXAMPLE ═══

Roster:
1. Calixto — blunt, slightly provocative
2. Aoife — anecdote-prone, ONE oddly remembered detail, sloppy with facts
3. Idony — fizzly joker
4. Dashiell — deadpan, low effort
5. Aurelio — salty self-deprecating about money
6. Yael — warm oversharing, longing leaks
7. Theron — UNIRONICALLY POSITIVE, genuinely means it
8. Fenwick — reading-elitist with bias

Question: "Do you think travel broadens your perspective more than reading about it?"

Correct output (8 lines — note the substantive takes that engage the question with anecdotes as supporting evidence; one short throwaway; an @-reply; an unironic-positive; accidental tenderness):
i think it depends on what you mean by "broaden". travel has made me less sentimental about places, not more. you go somewhere and it has gas stations and tired people just like home, and that's the lesson actually. reading does the opposite — i still picture every nineteenth-century london as cold and yellow, and i don't want to ruin it.
i went to porto once and got laughed at by a lady because of how i said "obrigada". i don't think that broadened my perspective on portugal exactly but it broadened my perspective on how confidently i'd been pronouncing things wrong my entire life. so i guess yes? a little? in a way that hurt my pride more than my worldview.
travel broadens you the way getting hit by a car broadens you. you do come back different, sure
travel is fine
i think people who say travel changed them are mostly trying to justify how much they spent on it. a long novel is sixteen bucks and three weeks. a long flight is fifteen-hundred and you're tired the whole time. on a per-realization basis books just dunk on travel.
i still think about this pistachio gelato i had in lisbon with my friend nadia, and how she said the city looked exactly like she'd imagined and i felt embarrassed because i'd imagined nothing. she's in copenhagen now and we kind of stopped texting. travel makes you notice how unprepared you are to be present, i think. or maybe that was just me.
honestly yes, unambiguously. i went to peru with my mom after college and i came back fundamentally different — not in a poetic way, just in how i think about my own life now. you cannot get that from a book, sorry. there is something about being in a place where your usual reference points stop working.
@calixto somewhat fair, but books also let you live inside a worldview without ever leaving your own — which is the opposite of broadening. great novels resist that, but most popular non-fiction is basically reassurance for people who already agree with it.

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
		// Most answers run 50-70 words now (substantive takes), with a
		// couple shorter and a couple longer; budget enough for the
		// whole batch.
		max_tokens: 1800
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

// Anecdote-prone personas: longer, story-shaped answers. Without
// stratifying the picker, a random shuffle can occasionally produce
// 10 short-take voices in a row, which makes the thread feel
// rapid-fire and one-note.
const ANECDOTAL_BOT_IDS = new Set([
	'seed_theron',
	'seed_soren',
	'seed_yael',
	'seed_aoife',
	'seed_mei',
	'seed_jihye'
]);

function pickAuthors(authors: SeedAuthor[], n: number): SeedAuthor[] {
	const anecdotal = authors.filter((a) => ANECDOTAL_BOT_IDS.has(a.bot_id));
	const others = authors.filter((a) => !ANECDOTAL_BOT_IDS.has(a.bot_id));
	const targetAnecdotal = Math.min(3, anecdotal.length, n);
	const targetOthers = Math.max(0, n - targetAnecdotal);

	const picked: SeedAuthor[] = [
		...shuffle(anecdotal).slice(0, targetAnecdotal),
		...shuffle(others).slice(0, targetOthers)
	];
	return shuffle(picked).slice(0, n);
}

// ─────────────────────────────────────────────────────────────────────
// Bot-as-commenter: generates a single short reply in a specific
// bot's voice, given some context (an answer they're replying to or
// a comment they're replying to). Used for both:
//   - Pass 2/3 of the daily-prompt thread (inter-bot back-and-forth)
//   - Bot replies on a real user's answer (guest-preview engagement)
// ─────────────────────────────────────────────────────────────────────

interface CommentContext {
	commenter: SeedAuthor;
	parentAuthorName: string;
	parentText: string;
	// If present, the commenter is replying to a comment, not a top-level post.
	// Lets the prompt know to keep it tight and conversational.
	isNested?: boolean;
}

function commentSystemPrompt(ctx: CommentContext): string {
	const persona = ctx.commenter.personality ?? 'no specific personality';
	return `You are ${ctx.commenter.name} on a daily-question forum. Your personality: ${persona}.

You are replying to ${ctx.parentAuthorName}'s ${ctx.isNested ? 'comment' : 'post'}:
"${ctx.parentText}"

Write ONE short reply in your character's first-person voice. Constraints:
- 3 to ${ctx.isNested ? 14 : 22} words. Most should be on the shorter side.
- Plain prose. No quotation marks, no name labels, no markdown, no narration ("X said"), no emoji, no hashtags.
- React to what was said — agree / disagree / joke / ask / share a tiny related thought / @ them ("@${ctx.parentAuthorName.toLowerCase()} same"). Be conversational, not summarizing.
- Match the messy register of the forum: occasional missing apostrophes ok, lowercase fine, fragments fine.
- DO NOT close on a profound flourish, metaphor, or "X not Y" construction. Keep it casual and grounded.
- If your personality is anecdote-heavy you can squeeze in ONE concrete tiny detail; if it's deadpan/sardonic, stay short.

Output ONLY the reply text. Nothing else.`;
}

async function generateBotComment(ai: Ai, ctx: CommentContext): Promise<string | null> {
	try {
		const res = (await ai.run(ANSWERS_MODEL, {
			messages: [
				{ role: 'system', content: commentSystemPrompt(ctx) },
				{ role: 'user', content: 'Write your reply.' }
			],
			temperature: 0.92,
			max_tokens: 140
		})) as { response?: string };
		const cleaned = cleanLine(res.response ?? '').trim();
		// Skip empty / suspiciously long output.
		if (!cleaned || cleaned.length > 350) return null;
		return cleaned;
	} catch (err) {
		console.error('generateBotComment failed:', err);
		return null;
	}
}

/**
 * After today's prompt + answers exist, generate inter-bot comments
 * to make the thread feel populated. Pass 2: bots comment on each
 * other's top-level answers. Pass 3: bots reply to those Pass 2
 * comments. Calls run in parallel (Workers AI handles concurrency).
 */
async function runMultiPassComments(
	db: D1Database,
	ai: Ai,
	prompt: { id: string; prompt_text: string },
	authors: SeedAuthor[]
): Promise<{ pass2: number; pass3: number }> {
	// Load the answers we just inserted (so we have post ids + content).
	const postsRes = await db
		.prepare(
			`SELECT id, user_id, content
			 FROM posts
			 WHERE prompt_id = ?
			   AND user_id IN (SELECT id FROM user WHERE bot_id LIKE 'seed_%')`
		)
		.bind(prompt.id)
		.all<{ id: string; user_id: string; content: string }>();
	const posts = postsRes.results ?? [];
	if (posts.length === 0) return { pass2: 0, pass3: 0 };

	const authorById = new Map<string, SeedAuthor>();
	for (const a of authors) authorById.set(a.user_id, a);

	// ── Pass 2: top-level inter-bot comments on the answers ──────────
	const pass2Plan: Array<{ commenter: SeedAuthor; parentPostId: string; parentText: string; parentAuthorName: string }> = [];
	for (let i = 0; i < INTERBOT_COMMENT_COUNT; i++) {
		const post = posts[Math.floor(Math.random() * posts.length)];
		const parentAuthor = authorById.get(post.user_id);
		const candidates = authors.filter((a) => a.user_id !== post.user_id);
		const commenter = candidates[Math.floor(Math.random() * candidates.length)];
		if (!commenter || !parentAuthor) continue;
		pass2Plan.push({
			commenter,
			parentPostId: post.id,
			parentText: post.content,
			parentAuthorName: parentAuthor.name
		});
	}

	const pass2Results = await Promise.all(
		pass2Plan.map(async (p) => {
			const text = await generateBotComment(ai, {
				commenter: p.commenter,
				parentAuthorName: p.parentAuthorName,
				parentText: p.parentText,
				isNested: false
			});
			return text ? { ...p, text, commentId: crypto.randomUUID() } : null;
		})
	);
	const pass2Inserted = pass2Results.filter((x): x is NonNullable<typeof x> => !!x);

	for (const c of pass2Inserted) {
		try {
			await db
				.prepare(
					'INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)'
				)
				.bind(c.commentId, c.parentPostId, c.commenter.user_id, c.text)
				.run();
		} catch (err) {
			console.error('pass2 insert failed', err);
		}
	}

	// ── Pass 3: nested replies on those comments ────────────────────
	if (pass2Inserted.length === 0) return { pass2: pass2Inserted.length, pass3: 0 };

	const pass3Plan: Array<{
		commenter: SeedAuthor;
		parentPostId: string;
		parentCommentId: string;
		parentText: string;
		parentAuthorName: string;
	}> = [];
	for (let i = 0; i < INTERBOT_NESTED_COUNT; i++) {
		const target = pass2Inserted[Math.floor(Math.random() * pass2Inserted.length)];
		const candidates = authors.filter((a) => a.user_id !== target.commenter.user_id);
		const commenter = candidates[Math.floor(Math.random() * candidates.length)];
		if (!commenter) continue;
		pass3Plan.push({
			commenter,
			parentPostId: target.parentPostId,
			parentCommentId: target.commentId,
			parentText: target.text,
			parentAuthorName: target.commenter.name
		});
	}

	const pass3Results = await Promise.all(
		pass3Plan.map(async (p) => {
			const text = await generateBotComment(ai, {
				commenter: p.commenter,
				parentAuthorName: p.parentAuthorName,
				parentText: p.parentText,
				isNested: true
			});
			return text ? { ...p, text, commentId: crypto.randomUUID() } : null;
		})
	);
	const pass3Inserted = pass3Results.filter((x): x is NonNullable<typeof x> => !!x);

	for (const c of pass3Inserted) {
		try {
			await db
				.prepare(
					'INSERT INTO comments (id, post_id, user_id, content, parent_comment_id) VALUES (?, ?, ?, ?, ?)'
				)
				.bind(c.commentId, c.parentPostId, c.commenter.user_id, c.text, c.parentCommentId)
				.run();
		} catch (err) {
			console.error('pass3 insert failed', err);
		}
	}

	return { pass2: pass2Inserted.length, pass3: pass3Inserted.length };
}

/**
 * Generate N short bot replies on a real user's just-posted answer.
 * Drives the "X people responded — sign in to read" engagement loop
 * for guests. Runs in parallel.
 */
export async function generateBotRepliesOnUserAnswer(
	db: D1Database,
	ai: Ai,
	postId: string,
	postContent: string,
	postAuthorName: string
): Promise<number> {
	const authors = await getSeedAuthors(db);
	if (authors.length === 0) return 0;

	const picked = shuffle(authors).slice(0, REPLIES_ON_USER_ANSWER);
	const results = await Promise.all(
		picked.map((commenter) =>
			generateBotComment(ai, {
				commenter,
				parentAuthorName: postAuthorName,
				parentText: postContent,
				isNested: false
			}).then((text) => (text ? { commenter, text } : null))
		)
	);

	let inserted = 0;
	for (const r of results) {
		if (!r) continue;
		try {
			await db
				.prepare('INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)')
				.bind(crypto.randomUUID(), postId, r.commenter.user_id, r.text)
				.run();
			inserted++;
		} catch (err) {
			console.error('user-reply insert failed', err);
		}
	}
	return inserted;
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
	const picked = pickAuthors(authors, n);
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

	// Pass 2 + Pass 3: inter-bot comments to make the thread look alive.
	const allAuthors = await getSeedAuthors(db);
	const passes = await runMultiPassComments(db, ai, prompt, allAuthors);
	return {
		prompt_id: prompt.id,
		prompt_text: prompt.prompt_text,
		answers_inserted: inserted,
		comments_inserted: passes.pass2 + passes.pass3
	};
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
	const picked = pickAuthors(authors, n);
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

	const passes = await runMultiPassComments(
		db,
		ai,
		{ id: promptId, prompt_text: promptText },
		authors
	);
	return {
		prompt_id: promptId,
		prompt_text: promptText,
		created: true,
		answers_inserted: inserted,
		comments_inserted: passes.pass2 + passes.pass3
	};
}
