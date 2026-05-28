import type { Ai } from '@cloudflare/workers-types';

type ModerationSurface = 'post' | 'comment' | 'circle';

interface ModerateInput {
	surface: ModerationSurface;
	text: string;
}

export interface ModerationDecision {
	allowed: boolean;
	category: 'ok' | 'doxxing' | 'uncertain';
	confidence: 'low' | 'medium' | 'high';
	reason: string;
}

interface AiTextRequest {
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
	temperature?: number;
	max_tokens?: number;
}

const MODERATION_MODEL = '@cf/google/gemma-3-12b-it';

const FALLBACK_ALLOW: ModerationDecision = {
	allowed: true,
	category: 'uncertain',
	confidence: 'low',
	reason: 'moderation unavailable'
};

const MODERATION_SYSTEM = `You are a loose content moderation classifier for a masked social app.

Your only job is to prevent doxxing and private-identifier exposure. Do NOT police tone, cringe humor, profanity, political opinions, gossip without identifying details, normal names, public figures, businesses, news discussion, or vague location references.

BLOCK only when the text appears to expose or solicit private identifying information about a private person, especially:
- exact home address or apartment/unit details tied to a person
- phone number, personal email, government ID, license plate, bank/payment details, medical record, or school/work schedule tied to a person
- "this is their real identity" plus enough details to find/contact them
- live location or stalking/harassment instructions for a private person
- requests for someone else's private contact/address/identity info

ALLOW:
- someone apparently sharing their own contact info or location
- city/neighborhood-level location without exact address
- public businesses, public events, public figures, news links, public records discussion
- usernames/handles alone
- fictional examples, jokes, memes, and ordinary first/last names without private contact/location details

Be loose. If it is ambiguous, allow it. Return compact JSON only:
{"allowed":true|false,"category":"ok"|"doxxing"|"uncertain","confidence":"low"|"medium"|"high","reason":"short reason"}`;

export async function moderateSocialContent(
	ai: Ai | undefined,
	input: ModerateInput
): Promise<ModerationDecision> {
	const text = input.text.replace(/\s+/g, ' ').trim();
	if (!text) return { ...FALLBACK_ALLOW, reason: 'empty content' };
	if (!ai) return FALLBACK_ALLOW;

	try {
		const res = await runTextModel(ai, MODERATION_MODEL, {
			messages: [
				{ role: 'system', content: MODERATION_SYSTEM },
				{
					role: 'user',
					content: `Surface: ${input.surface}\nText:\n${text.slice(0, 5000)}`
				}
			],
			temperature: 0,
			max_tokens: 180
		});
		return parseDecision(extractText(res));
	} catch (err) {
		console.warn('social moderation failed:', err);
		return FALLBACK_ALLOW;
	}
}

export function moderationErrorMessage(decision: ModerationDecision): string {
	if (decision.category === 'doxxing') {
		return 'This looks like it may expose private identifying information. Remove addresses, contact details, live location, or real-identity details and try again.';
	}
	return 'This could not be posted. Please edit it and try again.';
}

function runTextModel(ai: Ai, model: string, inputs: AiTextRequest): Promise<unknown> {
	return (ai.run as unknown as (model: string, inputs: AiTextRequest) => Promise<unknown>)(
		model,
		inputs
	);
}

function extractText(res: unknown): string {
	if (!res || typeof res !== 'object') return '';
	const r = res as Record<string, unknown>;
	if (typeof r.response === 'string') return r.response;

	const choices = (r.choices as Array<{ message?: Record<string, unknown> }> | undefined) ?? [];
	const message = choices[0]?.message ?? {};
	if (typeof message.content === 'string') return message.content;
	if (typeof message.reasoning_content === 'string') return message.reasoning_content;
	if (typeof message.reasoning === 'string') return message.reasoning;
	return '';
}

function parseDecision(raw: string): ModerationDecision {
	const text = raw.replace(/```(?:json)?|```/g, '').trim();
	const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;

	try {
		const parsed = JSON.parse(jsonText) as Partial<ModerationDecision>;
		return normalizeDecision(parsed);
	} catch {
		const lowered = text.toLowerCase();
		if (lowered.includes('"allowed":false') || lowered.includes('doxxing')) {
			return {
				allowed: false,
				category: 'doxxing',
				confidence: 'medium',
				reason: 'model flagged doxxing'
			};
		}
		return {
			allowed: true,
			category: 'uncertain',
			confidence: 'low',
			reason: 'unparseable moderation response'
		};
	}
}

function normalizeDecision(parsed: Partial<ModerationDecision>): ModerationDecision {
	const category =
		parsed.category === 'doxxing' || parsed.category === 'uncertain' || parsed.category === 'ok'
			? parsed.category
			: parsed.allowed === false
				? 'doxxing'
				: 'ok';
	const confidence =
		parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
			? parsed.confidence
			: 'low';
	const allowed = parsed.allowed === false ? false : category !== 'doxxing';

	return {
		allowed,
		category,
		confidence,
		reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 180) : 'classified'
	};
}
