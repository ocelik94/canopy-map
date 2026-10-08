import type { LocalDb, LocalDevice } from './db.ts';
import type { DeviceInput } from '../shared/schemas.ts';

export const SERVICE_STATUS_KEYS = ['battery', 'card', 'collected'];

export interface Ctx {
	db: LocalDb;
	userId?: string;
	now?: () => number;
	uuid?: () => string;
}
const nowOf = (c: Ctx) => (c.now ?? Date.now)();
const uuidOf = (c: Ctx) => (c.uuid ?? (() => crypto.randomUUID()))();
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type NewDevice = Pick<DeviceInput, 'name' | 'deviceTypeId' | 'statusId' | 'lat' | 'lon'> &
	Partial<DeviceInput>;

const TABLES = (db: LocalDb) => [
	db.devices,
	db.outbox,
	db.statusHistory,
	db.locationHistory,
	db.statuses
];

export async function createDevice(c: Ctx, input: NewDevice): Promise<LocalDevice> {
	const t = nowOf(c);
	const device: LocalDevice = {
		serial: '',
		categoryId: null,
		siteName: '',
		siteGroup: '',
		deployedOn: null,
		lastServiceOn: null,
		retrievalDueOn: null,
		notes: '',
		...input,
		id: input.id ?? uuidOf(c),
		createdAt: t,
		updatedAt: t,
		deletedAt: null,
		updatedBy: c.userId
	};
	await c.db.transaction('rw', TABLES(c.db), async () => {
		await c.db.devices.put(device);
		await enqueue(c, { kind: 'device.upsert', device: strip(device) });
		await logStatus(c, device.id, null, device.statusId, '', t);
		await logLocation(c, device, t);
	});
	return device;
}

export async function updateDevice(
	c: Ctx,
	id: string,
	patch: Partial<Omit<DeviceInput, 'id' | 'createdAt'>>,
	comment = ''
): Promise<LocalDevice> {
	return c.db.transaction('rw', TABLES(c.db), async () => {
		const cur = await c.db.devices.get(id);
		if (!cur) throw new Error('Device not found');
		const t = Math.max(nowOf(c), cur.updatedAt + 1);
		const next: LocalDevice = { ...cur, ...patch, id, updatedAt: t, updatedBy: c.userId };
		await c.db.devices.put(next);
		await enqueue(c, { kind: 'device.upsert', device: strip(next) });
		if (next.statusId !== cur.statusId)
			await logStatus(c, id, cur.statusId, next.statusId, comment, t);
		if (next.lat !== cur.lat || next.lon !== cur.lon) await logLocation(c, next, t);
		return next;
	});
}

export async function moveDevice(c: Ctx, id: string, lat: number, lon: number, siteName?: string) {
	return updateDevice(c, id, { lat, lon, ...(siteName !== undefined ? { siteName } : {}) });
}

export async function changeStatus(c: Ctx, id: string, statusId: string, comment = '') {
	const st = await c.db.statuses.get(statusId);
	const patch: Partial<DeviceInput> = { statusId };
	if (st?.key && SERVICE_STATUS_KEYS.includes(st.key)) patch.lastServiceOn = isoDay(nowOf(c));
	if (st?.key === 'recording') {
		const cur = await c.db.devices.get(id);
		if (cur && !cur.deployedOn) patch.deployedOn = isoDay(nowOf(c));
	}
	return updateDevice(c, id, patch, comment);
}

export const softDeleteDevice = (c: Ctx, id: string) =>
	updateDevice(c, id, { deletedAt: nowOf(c) });

async function enqueue(c: Ctx, m: DistributiveOmit<import('../shared/schemas.ts').Mutation, 'id'>) {
	const id = uuidOf(c);
	await c.db.outbox.add({ id, createdAt: nowOf(c), mutation: { id, ...m } as never });
}
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

async function logStatus(
	c: Ctx,
	deviceId: string,
	oldStatusId: string | null,
	newStatusId: string,
	comment: string,
	createdAt: number
) {
	const event = { id: uuidOf(c), deviceId, oldStatusId, newStatusId, comment, createdAt };
	await c.db.statusHistory.put({ ...event, userId: c.userId });
	await enqueue(c, { kind: 'status.add', event });
}

async function logLocation(c: Ctx, d: LocalDevice, recordedAt: number) {
	const event = {
		id: uuidOf(c),
		deviceId: d.id,
		lat: d.lat,
		lon: d.lon,
		siteName: d.siteName,
		recordedAt
	};
	await c.db.locationHistory.put({ ...event, userId: c.userId });
	await enqueue(c, { kind: 'location.add', event });
}

function strip(d: LocalDevice): DeviceInput {
	const { updatedBy: _u, seq: _s, ...rest } = d;
	return rest;
}
