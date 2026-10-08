import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireAdmin } from '#lib/server/guard.ts';
import { ValidationError, saveSettings } from '#lib/server/admin.ts';

export const PUT: RequestHandler = async ({ request, locals }) => {
	const admin = requireAdmin(locals);
	try {
		return json(saveSettings(getDb(), await request.json().catch(() => null), admin.id));
	} catch (e) {
		if (e instanceof ValidationError) error(400, e.message);
		throw e;
	}
};
