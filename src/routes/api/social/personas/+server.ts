import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensurePersona, listPersonas } from '$lib/server/social';

export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');
	return json({ personas: await listPersonas(db, locals.user.id) });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');
	const body = await request.json().catch(() => null);
	const label = typeof body?.label === 'string' ? body.label : '';
	try {
		const persona = await ensurePersona(db, locals.user.id, label);
		return json({ persona }, { status: 201 });
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : 'Could not create persona');
	}
};
