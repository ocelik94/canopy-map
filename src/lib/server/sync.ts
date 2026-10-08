import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Db } from './db/index.ts';
import {
	appliedMutations,
	categories,
	deviceTypes,
	devices,
	locationHistory,
	photos,
	settings,
	statusHistory,
	statuses,
	users
} from './db/schema.ts';
import { nextSeq } from './db/seq.ts';
import { logActivity } from './audit.ts';
import {
	mutationSchema,
	settingsSchema,
	type DeviceInput,
	type Mutation,
	type MutationResult,
	type PullResponse
} from '../shared/schemas.ts';

export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
export const PULL_PAGE = 500;

export function applyPush(
	db: Db,
	userId: string,
	rawMutations: unknown[],
	now = Date.now()
): MutationResult[] {
	return db.transaction((tx) =>
		rawMutations.map((raw): MutationResult => {
			const mid = (raw as { id?: unknown })?.id;
			const parsed = mutationSchema.safeParse(raw);
			if (!parsed.success) {
				return { id: typeof mid === 'string' ? mid : '?', result: 'rejected', reason: 'invalid' };
			}
			const m = parsed.data;

			if (tx.select().from(appliedMutations).where(eq(appliedMutations.mutationId, m.id)).get()) {
				return { id: m.id, result: 'duplicate' };
			}
			const outcome = applyOne(tx as unknown as Db, userId, m, now);
			tx.insert(appliedMutations).values({ mutationId: m.id, userId, appliedAt: now }).run();
			return { id: m.id, ...outcome };
		})
	);
}

function applyOne(
	tx: Db,
	userId: string,
	m: Mutation,
	now: number
): { result: MutationResult['result']; reason?: string } {
	switch (m.kind) {
		case 'device.upsert': {
			const d = m.device;
			if (!tx.select().from(deviceTypes).where(eq(deviceTypes.id, d.deviceTypeId)).get())
				return { result: 'rejected', reason: 'unknown device type' };
			if (!tx.select().from(statuses).where(eq(statuses.id, d.statusId)).get())
				return { result: 'rejected', reason: 'unknown status' };
			if (
				d.categoryId &&
				!tx.select().from(categories).where(eq(categories.id, d.categoryId)).get()
			)
				return { result: 'rejected', reason: 'unknown category' };

			const updatedAt = Math.min(d.updatedAt, now + MAX_CLOCK_SKEW_MS);
			const existing = tx.select().from(devices).where(eq(devices.id, d.id)).get();
			if (existing) {
				const incomingWins =
					updatedAt > existing.updatedAt ||
					(updatedAt === existing.updatedAt && userId > existing.updatedBy);
				if (!incomingWins) return { result: 'stale' };
			}
			const row = {
				name: d.name,
				serial: d.serial,
				deviceTypeId: d.deviceTypeId,
				categoryId: d.categoryId,
				statusId: d.statusId,
				lat: d.lat,
				lon: d.lon,
				siteName: d.siteName,
				siteGroup: d.siteGroup,
				deployedOn: d.deployedOn,
				lastServiceOn: d.lastServiceOn,
				retrievalDueOn: d.retrievalDueOn,
				notes: d.notes,
				updatedAt,
				updatedBy: userId,
				deletedAt: d.deletedAt,
				seq: nextSeq(tx)
			};
			if (existing) tx.update(devices).set(row).where(eq(devices.id, d.id)).run();
			else
				tx.insert(devices)
					.values({ id: d.id, createdAt: d.createdAt, ...row })
					.run();
			logDeviceUpsert(tx, userId, existing, d, updatedAt, now);
			return { result: 'applied' };
		}
		case 'status.add': {
			const e = m.event;
			const r = tx
				.insert(statusHistory)
				.values({ ...e, userId, seq: nextSeq(tx) })
				.onConflictDoNothing()
				.run();
			if (r.changes && e.oldStatusId) {
				const name = (id: string | null) =>
					id
						? (tx.select({ n: statuses.name }).from(statuses).where(eq(statuses.id, id)).get()?.n ??
							id)
						: null;
				logActivity(
					tx,
					{
						userId,
						action: 'device.status',
						entity: 'device',
						entityId: e.deviceId,
						label: deviceName(tx, e.deviceId),
						detail: {
							from: name(e.oldStatusId),
							to: name(e.newStatusId),
							...(e.comment ? { comment: e.comment } : {})
						},
						at: Math.min(e.createdAt, now + MAX_CLOCK_SKEW_MS)
					},
					now
				);
			}
			return { result: r.changes ? 'applied' : 'duplicate' };
		}
		case 'location.add': {
			const e = m.event;
			const r = tx
				.insert(locationHistory)
				.values({ ...e, userId, seq: nextSeq(tx) })
				.onConflictDoNothing()
				.run();
			const dev = tx
				.select({ createdAt: devices.createdAt, name: devices.name })
				.from(devices)
				.where(eq(devices.id, e.deviceId))
				.get();
			if (r.changes && dev && e.recordedAt !== dev.createdAt) {
				logActivity(
					tx,
					{
						userId,
						action: 'device.moved',
						entity: 'device',
						entityId: e.deviceId,
						label: dev.name,
						detail: e.siteName ? { site: e.siteName } : undefined,
						at: Math.min(e.recordedAt, now + MAX_CLOCK_SKEW_MS)
					},
					now
				);
			}
			return { result: r.changes ? 'applied' : 'duplicate' };
		}
	}
}

const FIELDS_LOGGED_ELSEWHERE = new Set([
	'statusId',
	'lat',
	'lon',
	'siteName',
	'updatedAt',
	'deletedAt',
	'createdAt',
	'id'
]);
const AUTO_WITH_STATUS = new Set(['lastServiceOn', 'deployedOn']);

function deviceName(tx: Db, id: string) {
	return tx.select({ n: devices.name }).from(devices).where(eq(devices.id, id)).get()?.n ?? '';
}

function logDeviceUpsert(
	tx: Db,
	userId: string,
	existing: typeof devices.$inferSelect | undefined,
	d: DeviceInput,
	at: number,
	now: number
) {
	const base = { userId, entity: 'device', entityId: d.id, label: d.name, at };
	if (!existing)
		return logActivity(
			tx,
			{ ...base, action: 'device.created', detail: d.siteName ? { site: d.siteName } : undefined },
			now
		);
	if (!existing.deletedAt && d.deletedAt)
		return logActivity(tx, { ...base, action: 'device.deleted' }, now);
	const statusChanged = existing.statusId !== d.statusId;
	const fields = (Object.keys(d) as (keyof DeviceInput)[]).filter(
		(k) =>
			!FIELDS_LOGGED_ELSEWHERE.has(k) &&
			!(statusChanged && AUTO_WITH_STATUS.has(k)) &&
			(existing as Record<string, unknown>)[k] !== d[k]
	);
	if (fields.length) logActivity(tx, { ...base, action: 'device.edited', detail: { fields } }, now);
}

export function getSettings(db: Db) {
	const rows = Object.fromEntries(
		db
			.select()
			.from(settings)
			.all()
			.map((r) => [r.key, r.value])
	);
	return settingsSchema.parse({
		maintenanceDays: rows.maintenanceDays ?? 90,
		rotationDate: rows.rotationDate ?? ''
	});
}

export function pullChanges(db: Db, since: number, limit = PULL_PAGE): PullResponse {
	return db.transaction((tx) => {
		const q = <T extends { seq: any }>(table: T) =>
			tx
				.select()
				.from(table as any)
				.where(gt((table as any).seq, since))
				.orderBy(asc((table as any).seq))
				.limit(limit)
				.all() as any[];

		const changes = {
			devices: q(devices),
			deviceTypes: q(deviceTypes),
			categories: q(categories),
			statuses: q(statuses),
			statusHistory: q(statusHistory),
			locationHistory: q(locationHistory),
			photos: q(photos).map(({ file: _file, ...p }) => p)
		};
		const lists = Object.values(changes);
		const full = lists.filter((l) => l.length >= limit);
		const maxSeq =
			tx
				.select({ v: sql<number>`coalesce(max(value), 0)` })
				.from(sql`counters`)
				.get()?.v ?? 0;
		const cursor = full.length ? Math.min(...full.map((l) => l[l.length - 1].seq)) : maxSeq;
		const userRows = tx.select({ id: users.id, username: users.username }).from(users).all();
		return {
			cursor: Math.max(cursor, since),
			hasMore: full.length > 0,
			serverTime: Date.now(),
			settings: getSettings(tx as unknown as Db),
			users: Object.fromEntries(userRows.map((u) => [u.id, u.username])),
			changes
		} as PullResponse;
	});
}
