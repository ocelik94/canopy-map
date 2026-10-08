import { randomUUID } from 'node:crypto';
import { eq, isNull } from 'drizzle-orm';
import { openDb } from '../src/lib/server/db/index.ts';
import { devices, statusHistory, locationHistory, users } from '../src/lib/server/db/schema.ts';
import { nextSeq } from '../src/lib/server/db/seq.ts';
import { config } from '../src/lib/server/config.ts';

const REGIONS: { group: string; sites: [string, number, number][] }[] = [
	{
		group: 'Vogelsberg',
		sites: [
			['Hoherodskopf', 50.511, 9.226],
			['Taufstein', 50.518, 9.243],
			['Niddaquelle', 50.498, 9.205],
			['Schotten Nord', 50.517, 9.13],
			['Ulrichstein', 50.577, 9.183]
		]
	},
	{
		group: 'Spessart',
		sites: [
			['Bad Orb Forst', 50.215, 9.355],
			['Jossgrund', 50.183, 9.47],
			['Biebergemünd', 50.152, 9.32],
			['Flörsbachtal', 50.12, 9.43]
		]
	},
	{
		group: 'Odenwald',
		sites: [
			['Felsberg', 49.718, 8.705],
			['Lindenfels', 49.683, 8.785],
			['Grasellenbach', 49.6, 8.83],
			['Beerfelden', 49.565, 8.978]
		]
	},
	{
		group: 'Taunus',
		sites: [
			['Großer Feldberg', 50.232, 8.457],
			['Altkönig', 50.21, 8.488],
			['Kleiner Feldberg', 50.223, 8.443],
			['Weilrod', 50.31, 8.39]
		]
	},
	{
		group: 'Rhön',
		sites: [
			['Wasserkuppe', 50.498, 9.938],
			['Rotes Moor', 50.454, 9.99],
			['Milseburg', 50.546, 9.902]
		]
	},
	{
		group: 'Kellerwald',
		sites: [
			['Wüstegarten', 51.071, 9.03],
			['Edersee Südufer', 51.165, 9.03],
			['Hohes Lohr', 51.073, 8.958]
		]
	},
	{
		group: 'Reinhardswald',
		sites: [
			['Sababurg', 51.548, 9.523],
			['Gahrenberg', 51.47, 9.6],
			['Staufenberg', 51.517, 9.48]
		]
	},
	{
		group: 'Knüll',
		sites: [
			['Eisenberg', 50.86, 9.465],
			['Knüllköpfchen', 50.877, 9.442]
		]
	}
];

const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const now = Date.now();
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const jitter = (lat: number, lon: number): [number, number] => [
	lat + (rnd() - 0.5) * 0.0028,
	lon + (rnd() - 0.5) * 0.0042
];

const STATUS_WEIGHTS: [string, number][] = [
	['recording', 46],
	['battery', 12],
	['card', 10],
	['collected', 9],
	['maintenance', 7],
	['faulty', 4],
	['planned', 6],
	['retrieved', 5],
	['lost', 1]
];
const weighted = () => {
	let r = rnd() * STATUS_WEIGHTS.reduce((a, [, w]) => a + w, 0);
	for (const [k, w] of STATUS_WEIGHTS) if ((r -= w) < 0) return k;
	return 'recording';
};

const db = openDb(config.databasePath);
const user = db.select().from(users).get();
if (!user) throw new Error('Create an admin first (pnpm create-admin).');

let removed = 0;
let created = 0;
db.transaction((tx) => {
	for (const d of tx
		.select({ id: devices.id })
		.from(devices)
		.where(isNull(devices.deletedAt))
		.all()) {
		tx.update(devices)
			.set({ deletedAt: now, updatedAt: now, updatedBy: user.id, seq: nextSeq(tx) })
			.where(eq(devices.id, d.id))
			.run();
		removed++;
	}

	let nSta = 0;
	let nMob = 0;
	for (const region of REGIONS) {
		for (const [site, lat0, lon0] of region.sites) {
			const perSite = 5 + Math.floor(rnd() * 4);
			for (let i = 0; i < perSite; i++) {
				const mobile = rnd() < 0.45;
				const id = randomUUID();
				const key = weighted();
				const statusId = `status-${key}`;
				const [lat, lon] = jitter(lat0, lon0);
				const deployed = now - (40 + Math.floor(rnd() * 300)) * day;
				const lastService =
					key === 'planned' ? null : deployed + Math.floor(rnd() * (now - deployed));
				const name = mobile
					? `MOB-${String(++nMob).padStart(3, '0')}`
					: `STA-${String(++nSta).padStart(3, '0')}`;
				tx.insert(devices)
					.values({
						id,
						name,
						serial: `${mobile ? 'AM' : 'AS'}${(24000 + nMob * 7 + nSta * 13).toString()}`,
						deviceTypeId: mobile ? 'type-mobile' : 'type-stationary',
						categoryId: mobile ? 'cat-type-mobile' : 'cat-type-stationary',
						statusId,
						lat,
						lon,
						siteName: site,
						siteGroup: region.group,
						deployedOn: key === 'planned' ? null : iso(deployed),
						lastServiceOn: lastService ? iso(lastService) : null,
						retrievalDueOn: mobile ? iso(now + (Math.floor(rnd() * 120) - 25) * day) : null,
						notes:
							rnd() < 0.15
								? pick([
										'Mounted on beech, 1.8 m',
										'Access via forestry road',
										'Wild boar activity nearby',
										'Solar panel shaded in summer'
									])
								: '',
						createdAt: deployed - 7 * day,
						updatedAt: now,
						updatedBy: user.id,
						seq: nextSeq(tx)
					})
					.run();

				const events: [string | null, string, number, string][] = [
					[null, 'status-planned', deployed - 7 * day, 'Site prepared']
				];
				if (key !== 'planned') {
					events.push(['status-planned', 'status-recording', deployed, 'Deployed']);
					let prev = 'status-recording';
					if (statusId !== prev)
						events.push([
							prev,
							statusId,
							lastService ?? now - day,
							pick(['', '', 'Routine visit', 'Checked mounting'])
						]);
					prev = statusId;
				}
				for (const [oldS, newS, at, comment] of events) {
					tx.insert(statusHistory)
						.values({
							id: randomUUID(),
							deviceId: id,
							oldStatusId: oldS,
							newStatusId: newS,
							comment,
							userId: user.id,
							createdAt: at,
							seq: nextSeq(tx)
						})
						.run();
				}

				if (mobile && rnd() < 0.3) {
					const [pSite, pLat, pLon] = pick(region.sites);
					const [la, lo] = jitter(pLat, pLon);
					tx.insert(locationHistory)
						.values({
							id: randomUUID(),
							deviceId: id,
							lat: la,
							lon: lo,
							siteName: pSite,
							recordedAt: deployed - 90 * day,
							userId: user.id,
							seq: nextSeq(tx)
						})
						.run();
				}
				tx.insert(locationHistory)
					.values({
						id: randomUUID(),
						deviceId: id,
						lat,
						lon,
						siteName: site,
						recordedAt: deployed,
						userId: user.id,
						seq: nextSeq(tx)
					})
					.run();
				created++;
			}
		}
	}
});
console.log(`Soft-deleted ${removed} previous devices, created ${created} test devices in Hessen.`);
