import type { PageServerLoad } from './$types';

interface PromptRow {
	id: string;
	prompt_text: string;
	active_date: string;
	answer_count: number;
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) return { prompts: [] as PromptRow[] };

	const res = await db
		.prepare(
			`SELECT
				dp.id,
				dp.prompt_text,
				dp.active_date,
				(SELECT COUNT(*) FROM posts p WHERE p.prompt_id = dp.id) AS answer_count
			FROM daily_prompts dp
			ORDER BY dp.active_date DESC
			LIMIT 200`
		)
		.all<PromptRow>();

	return { prompts: res.results ?? [] };
};
