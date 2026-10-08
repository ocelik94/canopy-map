import { describe, expect, it } from 'vitest';
import { devicesDueForService, groupByStatus, rotationDue, type PlanDevice } from './planning.ts';

const dev = (o: Partial<PlanDevice> & { id: string }): PlanDevice => ({
	name: o.id,
	statusId: 's-rec',
	deviceTypeId: 'type-fixed',
	siteName: '',
	siteGroup: '',
	deployedOn: null,
	lastServiceOn: null,
	retrievalDueOn: null,
	createdAt: Date.parse('2026-01-01T00:00:00Z'),
	deletedAt: null,
	...o
});
const statuses = [
	{ id: 's-rec', key: 'recording' },
	{ id: 's-ret', key: 'retrieved' },
	{ id: 's-lost', key: 'lost' },
	{ id: 's-plan', key: 'planned' }
];

describe('devicesDueForService', () => {
	const today = '2026-06-01';
	it('uses last service, then deployedOn, then createdAt', () => {
		const out = devicesDueForService(
			[
				dev({ id: 'a', lastServiceOn: '2026-01-01' }),
				dev({ id: 'b', deployedOn: '2026-03-01' }),
				dev({ id: 'c' }),
				dev({ id: 'd', lastServiceOn: '2026-05-20' })
			],
			today,
			90
		);
		expect(out.map((x) => x.device.id)).toEqual(['a', 'c', 'b']);
		expect(out.find((x) => x.device.id === 'c')!.neverServiced).toBe(true);
	});
	it('excludes deleted and retrieved/lost/planned, includes boundary', () => {
		const out = devicesDueForService(
			[
				dev({ id: 'a', lastServiceOn: '2026-03-03' }),
				dev({ id: 'del', deletedAt: 5 }),
				dev({ id: 'r', statusId: 's-ret' }),
				dev({ id: 'l', statusId: 's-lost' }),
				dev({ id: 'p', statusId: 's-plan' })
			],
			today,
			90,
			statuses
		);
		expect(out.map((x) => x.device.id)).toEqual(['a']);
		expect(out[0].daysSince).toBe(90);
	});
});

describe('groupByStatus', () => {
	it('groups', () => {
		const g = groupByStatus([dev({ id: 'a' }), dev({ id: 'b', statusId: 'x' }), dev({ id: 'c' })]);
		expect(g.get('s-rec')!.length).toBe(2);
		expect(g.get('x')!.length).toBe(1);
	});
});

describe('rotationDue', () => {
	const types = [
		{ id: 'type-mobile', name: 'Mobile' },
		{ id: 'type-fixed', name: 'Fixed' },
		{ id: 'custom', name: 'Roving Mobile unit' }
	];
	it('selects mobile devices due by date, most overdue first', () => {
		const out = rotationDue(
			[
				dev({ id: 'a', deviceTypeId: 'type-mobile', retrievalDueOn: '2026-05-20' }),
				dev({ id: 'b', deviceTypeId: 'type-mobile', retrievalDueOn: '2026-05-01' }),
				dev({ id: 'c', deviceTypeId: 'type-mobile', retrievalDueOn: '2026-07-01' }),
				dev({ id: 'd', deviceTypeId: 'type-fixed', retrievalDueOn: '2026-05-01' }),
				dev({ id: 'e', deviceTypeId: 'custom', deployedOn: '2026-02-01' }),
				dev({ id: 'f', deviceTypeId: 'type-mobile' }),
				dev({
					id: 'g',
					deviceTypeId: 'type-mobile',
					retrievalDueOn: '2026-05-01',
					statusId: 's-ret'
				}),
				dev({ id: 'h', deviceTypeId: 'type-mobile', retrievalDueOn: '2026-05-01', deletedAt: 1 })
			],
			types,
			'2026-06-01',
			statuses
		);
		expect(out.map((x) => x.device.id)).toEqual(['b', 'a', 'e']);
		expect(out[0].overdueDays).toBe(31);
	});
});
