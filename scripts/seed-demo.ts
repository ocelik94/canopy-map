import { randomUUID } from 'node:crypto';
import { openDb } from '../src/lib/server/db/index.ts';
import { devices, statusHistory, locationHistory, users } from '../src/lib/server/db/schema.ts';
import { nextSeq } from '../src/lib/server/db/seq.ts';
import { config } from '../src/lib/server/config.ts';

const [count = 500, lat0 = 47.9, lon0 = 11.4] = process.argv.slice(2).map(Number);
const db = openDb(config.databasePath);
const user = db.select().from(users).get();
if (!user) throw new Error('Create an admin first (pnpm create-admin).');

const statuses = [
	'recording',
	'recording',
	'recording',
	'battery',
	'card',
	'collected',
	'maintenance',
	'faulty',
	'planned',
	'retrieved',
	'lost'
];
const groups = ['North ridge', 'River valley', 'Spring 2026', 'Beech forest', 'Wetland'];
const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const now = Date.now();

db.transaction((tx) => {
	for (let i = 0; i < count; i++) {
		const id = randomUUID();
		const mobile = Math.random() < 0.45;
		const status = `status-${statuses[Math.floor(Math.random() * statuses.length)]}`;
		const lat = lat0 + (Math.random() - 0.5) * 0.6;
		const lon = lon0 + (Math.random() - 0.5) * 0.9;
		const deployed = now - Math.floor(Math.random() * 300) * day;
		const serviced = deployed + Math.floor(Math.random() * (now - deployed));
		tx.insert(devices)
			.values({
				id,
				name: `${mobile ? 'MOB' : 'STA'}-${String(i + 1).padStart(4, '0')}`,
				serial: `SN${100000 + i}`,
				deviceTypeId: mobile ? 'type-mobile' : 'type-stationary',
				categoryId: mobile ? 'cat-type-mobile' : 'cat-type-stationary',
				statusId: status,
				lat,
				lon,
				siteName: `Site ${Math.floor(i / 3) + 1}`,
				siteGroup: groups[i % groups.length],
				deployedOn: iso(deployed),
				lastServiceOn: iso(serviced),
				retrievalDueOn: mobile ? iso(now + (Math.floor(Math.random() * 120) - 30) * day) : null,
				notes: '',
				createdAt: deployed,
				updatedAt: now,
				updatedBy: user.id,
				seq: nextSeq(tx)
			})
			.run();
		tx.insert(statusHistory)
			.values({
				id: randomUUID(),
				deviceId: id,
				oldStatusId: null,
				newStatusId: status,
				comment: 'Demo data',
				userId: user.id,
				createdAt: deployed,
				seq: nextSeq(tx)
			})
			.run();
		tx.insert(locationHistory)
			.values({
				id: randomUUID(),
				deviceId: id,
				lat,
				lon,
				siteName: `Site ${Math.floor(i / 3) + 1}`,
				recordedAt: deployed,
				userId: user.id,
				seq: nextSeq(tx)
			})
			.run();
	}
});
console.log(`Inserted ${count} demo devices.`);
