import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { openDb, type Db } from './db/index.ts';
import { users } from './db/schema.ts';
import { applyPush } from './sync.ts';
import { deleteEntity, saveSettings, updateUser, upsertEntity } from './admin.ts';
import { createUser } from './auth.ts';
import { listAccess, listActivity, logAccess, summarizeUserAgent } from './audit.ts';

let db: Db;
beforeEach(() => {
	db = openDb(':memory:', path.resolve('drizzle'));
	db.insert(users)
		.values({ id: 'u1', username: 'ann', passwordHash: 'x', role: 'admin', createdAt: 0 })
		.run();
});

const uuid = () => crypto.randomUUID();
const device = (over: Record<string, unknown> = {}) => ({
	id: 'd0000000-0000-4000-8000-000000000001',
	name: 'STA-001',
	serial: '',
	deviceTypeId: 'type-stationary',
	categoryId: null,
	statusId: 'status-planned',
	lat: 50.5,
	lon: 9.2,
	siteName: 'Hoherodskopf',
	siteGroup: 'Vogelsberg',
	deployedOn: null,
	lastServiceOn: null,
	retrievalDueOn: null,
	notes: '',
	createdAt: 1000,
	updatedAt: 1000,
	deletedAt: null,
	...over
});
const actions = () =>
	listActivity(db)
		.entries.map((e) => e.action)
		.reverse();

describe('activity log from sync', () => {
	it('logs create, edit (changed fields only), status, move and delete — once each', () => {
		const d = device();
		applyPush(
			db,
			'u1',
			[
				{ id: uuid(), kind: 'device.upsert', device: d },
				{
					id: uuid(),
					kind: 'status.add',
					event: {
						id: uuid(),
						deviceId: d.id,
						oldStatusId: null,
						newStatusId: 'status-planned',
						comment: '',
						createdAt: 1000
					}
				},
				{
					id: uuid(),
					kind: 'location.add',
					event: {
						id: uuid(),
						deviceId: d.id,
						lat: 50.5,
						lon: 9.2,
						siteName: 'Hoherodskopf',
						recordedAt: 1000
					}
				}
			],
			5000
		);
		expect(actions()).toEqual(['device.created']);

		applyPush(
			db,
			'u1',
			[
				{
					id: uuid(),
					kind: 'device.upsert',
					device: device({ notes: 'new', serial: 'X1', updatedAt: 2000 })
				}
			],
			5000
		);
		applyPush(
			db,
			'u1',
			[
				{
					id: uuid(),
					kind: 'device.upsert',
					device: device({
						notes: 'new',
						serial: 'X1',
						statusId: 'status-battery',
						lastServiceOn: '2026-01-01',
						updatedAt: 3000
					})
				},
				{
					id: uuid(),
					kind: 'status.add',
					event: {
						id: uuid(),
						deviceId: d.id,
						oldStatusId: 'status-planned',
						newStatusId: 'status-battery',
						comment: 'cells',
						createdAt: 3000
					}
				}
			],
			5000
		);
		applyPush(
			db,
			'u1',
			[
				{
					id: uuid(),
					kind: 'device.upsert',
					device: device({
						notes: 'new',
						serial: 'X1',
						statusId: 'status-battery',
						lastServiceOn: '2026-01-01',
						lat: 50.6,
						lon: 9.3,
						siteName: 'Taufstein',
						updatedAt: 4000
					})
				},
				{
					id: uuid(),
					kind: 'location.add',
					event: {
						id: uuid(),
						deviceId: d.id,
						lat: 50.6,
						lon: 9.3,
						siteName: 'Taufstein',
						recordedAt: 4000
					}
				}
			],
			5000
		);
		applyPush(
			db,
			'u1',
			[
				{
					id: uuid(),
					kind: 'device.upsert',
					device: device({
						notes: 'new',
						serial: 'X1',
						statusId: 'status-battery',
						lastServiceOn: '2026-01-01',
						lat: 50.6,
						lon: 9.3,
						siteName: 'Taufstein',
						deletedAt: 4500,
						updatedAt: 4500
					})
				}
			],
			5000
		);

		expect(actions()).toEqual([
			'device.created',
			'device.edited',
			'device.status',
			'device.moved',
			'device.deleted'
		]);
		const byAction = Object.fromEntries(listActivity(db).entries.map((e) => [e.action, e]));
		expect(byAction['device.edited'].detail).toEqual({ fields: ['serial', 'notes'] });
		expect(byAction['device.status'].detail).toEqual({
			from: 'Planned',
			to: 'Battery Changed',
			comment: 'cells'
		});
		expect(byAction['device.moved'].detail).toEqual({ site: 'Taufstein' });
		expect(byAction['device.status'].username).toBe('ann');
		expect(byAction['device.status'].at).toBe(3000);
	});

	it('never stores coordinates', () => {
		const d = device({ lat: 50.123456, lon: 9.654321 });
		applyPush(db, 'u1', [{ id: uuid(), kind: 'device.upsert', device: d }], 5000);
		applyPush(
			db,
			'u1',
			[
				{
					id: uuid(),
					kind: 'location.add',
					event: {
						id: uuid(),
						deviceId: d.id,
						lat: 50.777777,
						lon: 9.888888,
						siteName: '',
						recordedAt: 3000
					}
				}
			],
			5000
		);
		const raw = JSON.stringify(db.$client.prepare('select * from activity_log').all());
		expect(raw).not.toMatch(/50\.12|9\.65|50\.77|9\.88/);
	});

	it('a retried push does not log twice', () => {
		const m = { id: uuid(), kind: 'device.upsert', device: device() };
		applyPush(db, 'u1', [m], 5000);
		applyPush(db, 'u1', [m], 5000);
		expect(actions()).toEqual(['device.created']);
	});
});

describe('activity log from admin actions', () => {
	it('logs reference data, settings and user changes; never passwords', async () => {
		upsertEntity(db, 'categories', { id: 'c1', name: 'North', color: '#112233', icon: '🌲' }, 'u1');
		upsertEntity(db, 'categories', { id: 'c1', name: 'North', color: '#112233', icon: '🌲' }, 'u1');
		upsertEntity(
			db,
			'categories',
			{ id: 'c1', name: 'North ridge', color: '#112233', icon: '🌲' },
			'u1'
		);
		deleteEntity(db, 'categories', 'c1', 'u1');
		saveSettings(db, { maintenanceDays: 30, rotationDate: '' }, 'u1');
		const bob = await createUser(db, {
			username: 'bob',
			password: 'a long password',
			role: 'user'
		});
		await updateUser(db, 'u1', bob.id, { password: 'another long password', role: 'admin' });
		const entries = listActivity(db).entries.reverse();
		expect(entries.map((e) => `${e.action}:${e.entity}`)).toEqual([
			'admin.created:category',
			'admin.updated:category',
			'admin.deleted:category',
			'admin.updated:settings',
			'admin.updated:user'
		]);
		expect(entries[1].detail).toEqual({ fields: ['name'] });
		expect(entries[4].detail).toEqual({ role: 'admin', passwordReset: true });
		expect(JSON.stringify(db.$client.prepare('select * from activity_log').all())).not.toContain(
			'long password'
		);
	});
});

describe('access log', () => {
	it('records events with a short device summary and pages newest first', () => {
		for (let i = 0; i < 5; i++)
			logAccess(
				db,
				{
					event: i % 2 ? 'login_failed' : 'login',
					username: `User${i}`,
					ip: '10.0.0.' + i,
					userAgent:
						'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
				},
				1000 + i
			);
		const p1 = listAccess(db, { limit: 2 });
		expect(p1.entries.map((e) => e.username)).toEqual(['user4', 'user3']);
		expect(p1.entries[0].userAgent).toBe('iPhone · Safari');
		const p2 = listAccess(db, { limit: 2, cursor: p1.next });
		expect(p2.entries.map((e) => e.username)).toEqual(['user2', 'user1']);
		expect(listAccess(db, { event: 'login_failed' }).entries).toHaveLength(2);
		expect(listAccess(db, { q: '10.0.0.3' }).entries.map((e) => e.username)).toEqual(['user3']);
	});

	it('summarises common browsers', () => {
		expect(
			summarizeUserAgent(
				'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
			)
		).toBe('Android · Chrome');
		expect(summarizeUserAgent('curl/8.6.0')).toBe('Script');
		expect(summarizeUserAgent('')).toBe('');
	});
});
