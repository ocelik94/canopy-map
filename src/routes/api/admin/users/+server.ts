import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireAdmin } from '#lib/server/guard.ts';
import { ValidationError, listUsers, updateUser } from '#lib/server/admin.ts';
import { createUser } from '#lib/server/auth.ts';
import { logActivity } from '#lib/server/audit.ts';
import { userCreateSchema } from '#lib/shared/schemas.ts';

export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json({ users: listUsers(getDb()) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireAdmin(locals);
	const body = userCreateSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Username (3+ chars) and password (10+ chars) required');
	try {
		const db = getDb();
		const created = await createUser(db, body.data);
		logActivity(db, {
			userId: admin.id,
			action: 'admin.created',
			entity: 'user',
			entityId: created.id,
			label: created.username,
			detail: { role: created.role }
		});
		return json(created, { status: 201 });
	} catch {
		error(409, 'Username already exists');
	}
};

const patchSchema = z.object({
	id: z.string(),
	role: z.enum(['admin', 'user']).optional(),
	disabled: z.boolean().optional(),
	password: z.string().optional()
});

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const admin = requireAdmin(locals);
	const body = patchSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid request');
	const { id, ...patch } = body.data;
	try {
		await updateUser(getDb(), admin.id, id, patch);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof ValidationError) error(400, e.message);
		throw e;
	}
};
