import { newResponse } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => newResponse(null, { status: 204 });
