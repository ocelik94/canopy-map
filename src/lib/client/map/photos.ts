import type { LocalDb } from '../db.ts';
import { resizeImage } from '../geo.ts';

export async function addPhoto(db: LocalDb, deviceId: string, file: Blob): Promise<string> {
	const blob = await resizeImage(file, 1600);
	const id = crypto.randomUUID();
	await db.photos.put({
		id,
		deviceId,
		mime: 'image/jpeg',
		createdAt: Date.now(),
		blob,
		uploaded: 0
	});
	return id;
}
