import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/guard.ts';
import { pullChanges } from '#lib/server/sync.ts';

export const GET: RequestHandler = ({ url, locals }) => {
	requireUser(locals);
	const since = z.coerce.number().int().min(0).catch(0).parse(url.searchParams.get('since'));
	return json(pullChanges(getDb(), since), { headers: { 'cache-control': 'no-store' } });
};
