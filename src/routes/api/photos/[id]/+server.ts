import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/guard.ts';
import { photos } from '#lib/server/db/schema.ts';
import { config } from '#lib/server/config.ts';

export const GET: RequestHandler = ({ params, locals }) => {
	requireUser(locals);
	const row = getDb().select().from(photos).where(eq(photos.id, params.id)).get();
	if (!row) error(404, 'Not found');
	const p = path.join(config.photosDir, path.basename(row.file));
	if (!fs.existsSync(p)) error(404, 'Not found');
	return new Response(fs.readFileSync(p), {
		headers: {
			'content-type': row.mime,
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};
