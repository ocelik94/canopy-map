import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireAdmin } from '#lib/server/guard.ts';
import {
	ENTITIES,
	ValidationError,
	deleteEntity,
	upsertEntity,
	type EntityName
} from '#lib/server/admin.ts';

function entity(name: string): EntityName {
	if (!(name in ENTITIES)) error(404, 'Unknown entity');
	return name as EntityName;
}

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireAdmin(locals);
	try {
		return json({
			id: upsertEntity(
				getDb(),
				entity(params.entity),
				await request.json().catch(() => null),
				admin.id
			)
		});
	} catch (e) {
		if (e instanceof ValidationError) error(400, e.message);
		throw e;
	}
};

export const DELETE: RequestHandler = ({ params, url, locals }) => {
	const admin = requireAdmin(locals);
	const id = url.searchParams.get('id');
	if (!id) error(400, 'id required');
	deleteEntity(getDb(), entity(params.entity), id, admin.id);
	return json({ ok: true });
};
