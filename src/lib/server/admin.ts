import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from './db/index.ts';
import { categories, deviceTypes, settings, statuses, users, sessions } from './db/schema.ts';
import { nextSeq } from './db/seq.ts';
import { hashPassword, validatePasswordStrength } from './auth.ts';
import { logActivity } from './audit.ts';
import {
	categorySchema,
	deviceTypeSchema,
	settingsSchema,
	statusSchema,
	type Settings
} from '../shared/schemas.ts';

export const ENTITIES = {
	types: { table: deviceTypes, schema: deviceTypeSchema },
	categories: { table: categories, schema: categorySchema },
	statuses: { table: statuses, schema: statusSchema }
} as const;
export type EntityName = keyof typeof ENTITIES;
const LOG_ENTITY: Record<EntityName, string> = {
	types: 'deviceType',
	categories: 'category',
	statuses: 'status'
};

export class ValidationError extends Error {}

export function upsertEntity(
	db: Db,
	name: EntityName,
	raw: unknown,
	actorId?: string,
	now = Date.now()
) {
	const { table, schema } = ENTITIES[name];
	const parsed = schema.safeParse(raw);
	if (!parsed.success) throw new ValidationError('Invalid data');
	const data = parsed.data as Record<string, unknown> & { id: string; name: string };
	db.transaction((tx) => {
		const before = tx
			.select()
			.from(table as any)
			.where(eq((table as any).id, data.id))
			.get() as Record<string, unknown> | undefined;
		if (actorId) {
			const changed = before
				? Object.keys(data).filter((k) => k !== 'id' && before[k] !== data[k])
				: [];
			if (!before || changed.length)
				logActivity(
					tx as unknown as Db,
					{
						userId: actorId,
						action: before ? 'admin.updated' : 'admin.created',
						entity: LOG_ENTITY[name],
						entityId: data.id,
						label: data.name,
						detail: before ? { fields: changed } : undefined
					},
					now
				);
		}
		const values = { ...data, updatedAt: now, deletedAt: null, seq: nextSeq(tx) };
		tx.insert(table as any)
			.values(values)
			.onConflictDoUpdate({ target: (table as any).id, set: values })
			.run();
	});
	return data.id;
}

export function deleteEntity(
	db: Db,
	name: EntityName,
	id: string,
	actorId?: string,
	now = Date.now()
) {
	const { table } = ENTITIES[name];
	db.transaction((tx) => {
		const row = tx
			.select()
			.from(table as any)
			.where(eq((table as any).id, id))
			.get() as { name?: string; deletedAt?: number | null } | undefined;
		if (actorId && row && !row.deletedAt)
			logActivity(
				tx as unknown as Db,
				{
					userId: actorId,
					action: 'admin.deleted',
					entity: LOG_ENTITY[name],
					entityId: id,
					label: row.name ?? ''
				},
				now
			);
		tx.update(table as any)
			.set({ deletedAt: now, updatedAt: now, seq: nextSeq(tx) })
			.where(eq((table as any).id, id))
			.run();
	});
}

export function saveSettings(db: Db, raw: unknown, actorId?: string): Settings {
	const parsed = settingsSchema.safeParse(raw);
	if (!parsed.success) throw new ValidationError('Invalid settings');
	db.transaction((tx) => {
		if (actorId)
			logActivity(tx as unknown as Db, {
				userId: actorId,
				action: 'admin.updated',
				entity: 'settings',
				label: 'Settings',
				detail: { ...parsed.data }
			});
		for (const [key, value] of Object.entries(parsed.data)) {
			tx.insert(settings)
				.values({ key, value: String(value) })
				.onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
				.run();
		}
		nextSeq(tx);
	});
	return parsed.data;
}

export function listUsers(db: Db) {
	return db
		.select({ id: users.id, username: users.username, role: users.role, disabled: users.disabled })
		.from(users)
		.all();
}

export async function updateUser(
	db: Db,
	actorId: string,
	id: string,
	patch: { role?: 'admin' | 'user'; disabled?: boolean; password?: string }
) {
	const target = db.select().from(users).where(eq(users.id, id)).get();
	if (!target) throw new ValidationError('No such user');
	const losesAdmin = target.role === 'admin' && (patch.role === 'user' || patch.disabled === true);
	if (losesAdmin) {
		const admins = db
			.select({ n: sql<number>`count(*)` })
			.from(users)
			.where(sql`${users.role} = 'admin' and ${users.disabled} = 0`)
			.get()!.n;
		if (admins <= 1 || id === actorId)
			throw new ValidationError('Cannot remove the last active admin');
	}
	const set: Partial<typeof users.$inferInsert> = {};
	if (patch.role) set.role = patch.role;
	if (patch.disabled !== undefined) set.disabled = patch.disabled;
	if (patch.password !== undefined) {
		const weak = validatePasswordStrength(patch.password);
		if (weak) throw new ValidationError(weak);
		set.passwordHash = await hashPassword(patch.password);
		db.delete(sessions).where(eq(sessions.userId, id)).run();
	}
	if (Object.keys(set).length) {
		db.update(users).set(set).where(eq(users.id, id)).run();
		logActivity(db, {
			userId: actorId,
			action: 'admin.updated',
			entity: 'user',
			entityId: id,
			label: target.username,
			detail: {
				...(patch.role ? { role: patch.role } : {}),
				...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
				...(patch.password !== undefined ? { passwordReset: true } : {})
			}
		});
	}
}

export const newId = () => randomUUID();
