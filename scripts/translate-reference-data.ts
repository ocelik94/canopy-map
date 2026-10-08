import { eq } from 'drizzle-orm';
import { openDb } from '../src/lib/server/db/index.ts';
import { categories, deviceTypes, statuses, users } from '../src/lib/server/db/schema.ts';
import { upsertEntity } from '../src/lib/server/admin.ts';
import { seedNames } from '../src/lib/server/db/seed.ts';
import { config } from '../src/lib/server/config.ts';

const target = process.argv[2];
if (target !== 'en' && target !== 'de') {
	console.error('Usage: pnpm translate:reference-data en|de');
	process.exit(1);
}
const NAMES = seedNames(target);
const db = openDb(config.databasePath);
const admin = db.select().from(users).where(eq(users.role, 'admin')).get()!;
let n = 0;
for (const t of db.select().from(deviceTypes).all()) {
	const names = NAMES[t.id];
	if (names && t.name !== names.name) {
		upsertEntity(db, 'types', { ...t, ...names }, admin.id);
		n++;
	}
	const cat = db
		.select()
		.from(categories)
		.where(eq(categories.id, `cat-${t.id}`))
		.get();
	if (names && cat && cat.name !== names.name) {
		upsertEntity(db, 'categories', { ...cat, name: names.name }, admin.id);
		n++;
	}
}
for (const s of db.select().from(statuses).all()) {
	const names = s.key ? NAMES[s.key] : undefined;
	if (names && s.name !== names.name) {
		upsertEntity(db, 'statuses', { ...s, name: names.name }, admin.id);
		n++;
	}
}
console.log(`renamed ${n} reference entries to ${target}`);
