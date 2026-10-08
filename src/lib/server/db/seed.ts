import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { deviceTypes, statuses, settings, categories } from './schema.ts';
import { nextSeq } from './seq.ts';

export const SEED_NAMES_DE: Record<string, { name: string; description?: string }> = {
	'type-stationary': {
		name: 'Stationärer Rekorder',
		description:
			'Extern versorgter Akustikrekorder, bodennah für die gesamte Erhebungsdauer installiert.'
	},
	'type-mobile': {
		name: 'Mobiler Rekorder',
		description:
			'Batteriebetriebener Rekorder mit SD-Speicher, an Bäumen befestigt, saisonal ausgebracht und zwischen Standorten rotiert.'
	},
	planned: { name: 'Geplant' },
	recording: { name: 'Ausgebracht / Aufnahme' },
	battery: { name: 'Batterie gewechselt' },
	card: { name: 'Speicherkarte gewechselt' },
	collected: { name: 'Daten ausgelesen' },
	maintenance: { name: 'Wartung nötig' },
	faulty: { name: 'Defekt' },
	retrieved: { name: 'Eingeholt / im Lager' },
	lost: { name: 'Verloren / vermisst' }
};
const seedDe = process.env.SEED_LANGUAGE === 'de';

const TYPES = [
	{
		id: 'type-stationary',
		name: 'Stationary recorder',
		description:
			'Externally powered acoustic recorder installed close to the ground for the whole survey period.',
		icon: '🔌',
		color: '#1b5e20'
	},
	{
		id: 'type-mobile',
		name: 'Mobile recorder',
		description:
			'Battery-powered recorder with internal SD storage, attached to trees, deployed seasonally and rotated between sites.',
		icon: '🔋',
		color: '#0d47a1'
	}
];

const STATUSES = [
	['planned', 'Planned', '#455a64', '🗓️'],
	['recording', 'Deployed / Recording', '#2e7d32', '🎙️'],
	['battery', 'Battery Changed', '#00695c', '🔋'],
	['card', 'Storage Card Changed', '#00796b', '💾'],
	['collected', 'Data Collected', '#1565c0', '📥'],
	['maintenance', 'Needs Maintenance', '#b45309', '🔧'],
	['faulty', 'Faulty', '#b71c1c', '⚠️'],
	['retrieved', 'Retrieved / In Storage', '#5d4037', '📦'],
	['lost', 'Lost / Missing', '#6a1b9a', '❓']
] as const;

export function seedDefaults(db: Db) {
	const now = Date.now();
	db.transaction((tx) => {
		if (tx.select().from(deviceTypes).limit(1).all().length === 0) {
			const types = TYPES.map((t) => (seedDe ? { ...t, ...SEED_NAMES_DE[t.id] } : t));
			for (const t of types)
				tx.insert(deviceTypes)
					.values({ ...t, updatedAt: now, seq: nextSeq(tx) })
					.run();
			for (const t of types) {
				tx.insert(categories)
					.values({
						id: `cat-${t.id}`,
						name: t.name,
						color: t.color,
						icon: t.icon,
						deviceTypeId: t.id,
						updatedAt: now,
						seq: nextSeq(tx)
					})
					.run();
			}
		}
		if (tx.select().from(statuses).limit(1).all().length === 0) {
			STATUSES.forEach(([key, name, color, icon], i) =>
				tx
					.insert(statuses)
					.values({
						id: `status-${key}`,
						key,
						name: seedDe ? SEED_NAMES_DE[key].name : name,
						color,
						icon,
						sortOrder: i,
						updatedAt: now,
						seq: nextSeq(tx)
					})
					.run()
			);
		}
		const defaults: Record<string, string> = { maintenanceDays: '90', rotationDate: '' };
		for (const [key, value] of Object.entries(defaults)) {
			if (!tx.select().from(settings).where(eq(settings.key, key)).get())
				tx.insert(settings).values({ key, value }).run();
		}
	});
}

export function seedNames(
	lang: 'en' | 'de'
): Record<string, { name: string; description?: string }> {
	if (lang === 'de') return SEED_NAMES_DE;
	return {
		...Object.fromEntries(TYPES.map((t) => [t.id, { name: t.name, description: t.description }])),
		...Object.fromEntries(STATUSES.map(([key, name]) => [key, { name }]))
	};
}
