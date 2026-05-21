import type { D1Database } from '@cloudflare/workers-types';

export interface PromptRow {
	id: string;
	prompt_text: string;
	active_date: string;
	created_at: number;
}

export function todayUTC(now = new Date()): string {
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(now.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export async function getPromptForDate(
	db: D1Database,
	date = todayUTC()
): Promise<PromptRow | null> {
	return await db
		.prepare(
			`SELECT id, prompt_text, active_date, created_at
			 FROM daily_prompts
			 WHERE active_date = ?
			 ORDER BY created_at DESC, id DESC
			 LIMIT 1`
		)
		.bind(date)
		.first<PromptRow>();
}

export async function getActivePrompt(db: D1Database, now = new Date()): Promise<PromptRow | null> {
	return await db
		.prepare(
			`SELECT id, prompt_text, active_date, created_at
			 FROM daily_prompts
			 WHERE active_date <= ?
			 ORDER BY active_date DESC, created_at DESC, id DESC
			 LIMIT 1`
		)
		.bind(todayUTC(now))
		.first<PromptRow>();
}
