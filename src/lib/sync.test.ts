import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type Db } from './server/db/index.ts';
import { applyPush, pullChanges } from './server/sync.ts';
import {
	devices,
	locationHistory,
	statusHistory,
	appliedMutations,
	users
} from './server/db/schema.ts';
import { LocalDb } from './client/db.ts';
import {
	createDevice,
	updateDevice,
	changeStatus,
	moveDevice,
	softDeleteDevice,
	type Ctx
} from './client/repo.ts';
import { createSyncEngine, NetworkError, type Transport } from './client/sync.ts';

let server: Db;
let seq = 0;
beforeEach(() => {
	server = openDb(':memory:', path.resolve('drizzle'));
	for (const id of ['u1', 'u2'])
		server
			.insert(users)
			.values({ id, username: id, passwordHash: 'x', role: 'user', createdAt: 0 })
			.run();
});

interface Net {
	online: boolean;
	dropNextResponse: boolean;
	pageSize: number;
}

function client(userId: string, clock: { t: number }) {
	const net: Net = { online: true, dropNextResponse: false, pageSize: 500 };
	const db = new LocalDb(`canopy-${userId}-${seq++}`, { indexedDB: new IDBFactory(), IDBKeyRange });
	const transport: Transport = {
		async push(m) {
			if (!net.online) throw new NetworkError('offline');
			const r = applyPush(server, userId, m, clock.t);
			if (net.dropNextResponse) {
				net.dropNextResponse = false;
				throw new NetworkError('lost ack');
			}
			return r;
		},
		async pull(since) {
			if (!net.online) throw new NetworkError('offline');
			return pullChanges(server, since, net.pageSize);
		}
	};
	const ctx: Ctx = {
		db,
		userId,
		now: () => clock.t,
		uuid: () => crypto.randomUUID()
	};
	const engine = createSyncEngine({ db, transport, now: () => clock.t });
	return { db, net, ctx, engine };
}

const base = {
	name: 'REC-001',
	deviceTypeId: 'type-stationary',
	statusId: 'status-planned',
	lat: 48.1,
	lon: 11.5
};

describe('offline then online', () => {
	it('queues changes while offline and syncs them once, in order, when back online', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		await a.engine.sync();
		expect(await a.db.statuses.count()).toBe(9);

		a.net.online = false;
		const d = await createDevice(a.ctx, base);
		clock.t += 1000;
		await moveDevice(a.ctx, d.id, 48.2, 11.6, 'Ridge site');
		clock.t += 1000;
		await changeStatus(a.ctx, d.id, 'status-battery', 'new cells');

		const local = (await a.db.devices.get(d.id))!;
		expect(local).toMatchObject({ lat: 48.2, statusId: 'status-battery', siteName: 'Ridge site' });
		expect(local.lastServiceOn).toBe('1970-01-01');
		expect(await a.db.outbox.count()).toBe(7);
		await a.engine.sync();
		expect(a.engine.state.online).toBe(false);
		expect(a.engine.state.pending).toBe(7);
		expect(server.select().from(devices).all()).toHaveLength(0);

		a.net.online = true;
		await a.engine.sync();
		expect(a.engine.state).toMatchObject({ online: true, pending: 0, error: null });
		expect(await a.db.outbox.count()).toBe(0);

		const [row] = server.select().from(devices).all();
		expect(row).toMatchObject({ id: d.id, lat: 48.2, statusId: 'status-battery', updatedBy: 'u1' });
		expect(
			server
				.select()
				.from(statusHistory)
				.all()
				.map((s) => s.newStatusId)
		).toEqual(expect.arrayContaining(['status-planned', 'status-battery']));
		expect(server.select().from(locationHistory).all()).toHaveLength(2);
	});

	it('is idempotent: a push whose response was lost can be retried without duplicates', async () => {
		const clock = { t: 5_000_000 };
		const a = client('u1', clock);
		await a.engine.sync();
		await createDevice(a.ctx, base);
		a.net.dropNextResponse = true;
		await a.engine.sync();
		expect(a.engine.state.online).toBe(false);
		expect(await a.db.outbox.count()).toBe(3);
		expect(server.select().from(devices).all()).toHaveLength(1);
		await a.engine.sync();
		expect(await a.db.outbox.count()).toBe(0);
		expect(server.select().from(devices).all()).toHaveLength(1);
		expect(server.select().from(statusHistory).all()).toHaveLength(1);
		expect(server.select().from(locationHistory).all()).toHaveLength(1);
		expect(server.select().from(appliedMutations).all()).toHaveLength(3);
	});

	it('re-pushing the same mutations directly is a no-op', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		await a.engine.sync();
		await createDevice(a.ctx, base);
		const muts = (await a.db.outbox.toArray()).map((o) => o.mutation);
		expect(applyPush(server, 'u1', muts, clock.t).map((r) => r.result)).toEqual([
			'applied',
			'applied',
			'applied'
		]);
		expect(applyPush(server, 'u1', muts, clock.t).map((r) => r.result)).toEqual([
			'duplicate',
			'duplicate',
			'duplicate'
		]);
	});
});

describe('conflicts between two field users', () => {
	it('last write wins per record, but status and location history from both are kept', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		const b = client('u2', clock);
		await a.engine.sync();
		const d = await createDevice(a.ctx, base);
		await a.engine.sync();
		await b.engine.sync();
		expect(await b.db.devices.get(d.id)).toBeTruthy();

		a.net.online = false;
		b.net.online = false;
		clock.t += 10_000;
		await changeStatus(a.ctx, d.id, 'status-faulty', 'A: cracked housing');
		await moveDevice(a.ctx, d.id, 1, 1);
		clock.t += 10_000;
		await changeStatus(b.ctx, d.id, 'status-card', 'B: swapped SD');
		await updateDevice(b.ctx, d.id, { notes: 'B was here' });

		b.net.online = true;
		await b.engine.sync();
		a.net.online = true;
		await a.engine.sync();
		await b.engine.sync();

		const winner = server.select().from(devices).get()!;
		expect(winner.statusId).toBe('status-card');
		expect(winner.notes).toBe('B was here');
		expect([winner.lat, winner.lon]).not.toEqual([1, 1]);

		const history = server
			.select()
			.from(statusHistory)
			.all()
			.map((s) => s.comment);
		expect(history).toEqual(expect.arrayContaining(['A: cracked housing', 'B: swapped SD']));
		expect(
			server
				.select()
				.from(locationHistory)
				.all()
				.map((l) => [l.lat, l.lon])
		).toContainEqual([1, 1]);

		for (const c of [a, b]) {
			const l = (await c.db.devices.get(d.id))!;
			expect(l.statusId).toBe('status-card');
			expect(await c.db.statusHistory.where('deviceId').equals(d.id).count()).toBe(3);
		}
	});

	it('a client edit newer than the server copy survives a pull while still unsent', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		const b = client('u2', clock);
		await a.engine.sync();
		const d = await createDevice(a.ctx, base);
		await a.engine.sync();
		await b.engine.sync();
		clock.t += 1000;
		await updateDevice(b.ctx, d.id, { notes: 'from B' });
		await b.engine.sync();
		clock.t += 1000;
		await updateDevice(a.ctx, d.id, { notes: 'from A (newer, unsent)' });
		const { applyPull } = await import('./client/sync.ts');
		await applyPull(a.db, pullChanges(server, 0));
		expect((await a.db.devices.get(d.id))!.notes).toBe('from A (newer, unsent)');
		await a.engine.sync();
		expect(server.select().from(devices).get()!.notes).toBe('from A (newer, unsent)');
	});

	it('soft deletes sync and are not resurrected by an older edit', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		const b = client('u2', clock);
		await a.engine.sync();
		const d = await createDevice(a.ctx, base);
		await a.engine.sync();
		await b.engine.sync();
		b.net.online = false;
		clock.t += 1000;
		await updateDevice(b.ctx, d.id, { notes: 'older offline edit' });
		clock.t += 1000;
		await softDeleteDevice(a.ctx, d.id);
		await a.engine.sync();
		b.net.online = true;
		await b.engine.sync();
		expect(server.select().from(devices).get()!.deletedAt).not.toBeNull();
		expect((await b.db.devices.get(d.id))!.deletedAt).not.toBeNull();
	});
});

describe('robustness', () => {
	it('a rejected mutation is reported but does not block the rest of the queue', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		await a.engine.sync();
		await createDevice(a.ctx, { ...base, name: 'bad', deviceTypeId: 'no-such-type' });
		await createDevice(a.ctx, { ...base, name: 'good' });
		await a.engine.sync();
		expect(await a.db.outbox.count()).toBe(0);
		expect(
			server
				.select()
				.from(devices)
				.all()
				.map((d) => d.name)
		).toEqual(['good']);
		expect((await a.db.meta.get('issues'))!.value).toHaveLength(1);
	});

	it('pulls large change sets across several pages', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		const b = client('u2', clock);
		await a.engine.sync();
		for (let i = 0; i < 7; i++) await createDevice(a.ctx, { ...base, name: `d${i}`, lat: 40 + i });
		await a.engine.sync();
		b.net.pageSize = 3;
		await b.engine.sync();
		expect(await b.db.devices.count()).toBe(7);
		expect(await b.db.statusHistory.count()).toBe(7);
		expect(await b.db.statuses.count()).toBe(9);
	});

	it('clamps timestamps from clients with a clock far in the future', async () => {
		const clock = { t: 1_000_000 };
		const a = client('u1', clock);
		await a.engine.sync();
		const d = await createDevice(a.ctx, base);
		await updateDevice(a.ctx, d.id, { notes: 'future' });
		await a.db.outbox.toCollection().modify((o) => {
			if (o.mutation.kind === 'device.upsert') o.mutation.device.updatedAt = 9e15;
		});
		await a.engine.sync();
		expect(server.select().from(devices).get()!.updatedAt).toBeLessThan(2_000_000);
	});

	it('rejects malformed payloads (bad coordinates) without touching data', async () => {
		const res = applyPush(
			server,
			'u1',
			[
				{
					id: crypto.randomUUID(),
					kind: 'device.upsert',
					device: { ...base, id: crypto.randomUUID(), lat: 999, createdAt: 1, updatedAt: 1 }
				}
			],
			1
		);
		expect(res[0].result).toBe('rejected');
		expect(server.select().from(devices).all()).toHaveLength(0);
	});
});
