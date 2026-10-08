import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/guard.ts';
import { applyPush } from '#lib/server/sync.ts';
import { pushRequestSchema } from '#lib/shared/schemas.ts';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const body = pushRequestSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid request');
	return json({ results: applyPush(getDb(), user.id, body.data.mutations) });
};
