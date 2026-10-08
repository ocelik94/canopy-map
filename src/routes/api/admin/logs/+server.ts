import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireAdmin } from '#lib/server/guard.ts';
import { listAccess, listActivity } from '#lib/server/audit.ts';

export const GET: RequestHandler = ({ url, locals }) => {
	requireAdmin(locals);
	const p = url.searchParams;
	const common = { cursor: p.get('cursor'), q: p.get('q')?.slice(0, 64) || null };
	const headers = { 'cache-control': 'no-store' };
	switch (p.get('type')) {
		case 'access':
			return json(listAccess(getDb(), { ...common, event: p.get('event') || null }), { headers });
		case 'activity':
			return json(listActivity(getDb(), { ...common, entity: p.get('entity') || null }), {
				headers
			});
		default:
			error(400, 'type must be access or activity');
	}
};
