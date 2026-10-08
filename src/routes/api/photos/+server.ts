import { json, error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/guard.ts';
import { photos } from '#lib/server/db/schema.ts';
import { nextSeq } from '#lib/server/db/seq.ts';
import { config } from '#lib/server/config.ts';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};
const meta = z.object({
	id: z.uuid(),
	deviceId: z.uuid(),
	createdAt: z.coerce.number().int().nonnegative()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	const m = meta.safeParse(Object.fromEntries(form ?? []));
	if (!m.success || !(file instanceof File)) error(400, 'Invalid upload');
	const ext = TYPES[file.type];
	if (!ext) error(415, 'Only JPEG, PNG or WebP');
	if (file.size > MAX_BYTES) error(413, 'Photo too large');

	const db = getDb();
	const name = `${m.data.id}.${ext}`;
	fs.mkdirSync(config.photosDir, { recursive: true });
	fs.writeFileSync(path.join(config.photosDir, name), Buffer.from(await file.arrayBuffer()));
	db.transaction((tx) => {
		tx.insert(photos)
			.values({ ...m.data, mime: file.type, file: name, userId: user.id, seq: nextSeq(tx) })
			.onConflictDoNothing()
			.run();
	});
	return json({ ok: true }, { status: 201 });
};
