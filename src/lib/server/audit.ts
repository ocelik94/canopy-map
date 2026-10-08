import { and, desc, eq, like, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/index.ts';
import { accessLog, activityLog, users } from './db/schema.ts';

export const AUDIT_RETENTION_DAYS = 180;

export type AccessEvent = (typeof accessLog.$inferInsert)['event'];

export function summarizeUserAgent(ua: string | null | undefined): string {
	if (!ua) return '';
	const os = /iPhone|iPad|iPod/.test(ua)
		? /iPad/.test(ua)
			? 'iPad'
			: 'iPhone'
		: /Android/.test(ua)
			? 'Android'
			: /Windows/.test(ua)
				? 'Windows'
				: /Mac OS X|Macintosh/.test(ua)
					? 'macOS'
					: /Linux/.test(ua)
						? 'Linux'
						: '';
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\/|FxiOS/.test(ua)
			? 'Firefox'
			: /Chrome\/|CriOS/.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: /curl|wget|python|node/i.test(ua)
						? 'Script'
						: '';
	return [os, browser].filter(Boolean).join(' · ') || 'Other';
}

let lastPrune = 0;
function pruneOccasionally(db: Db, now: number) {
	if (now - lastPrune < 6 * 3_600_000) return;
	lastPrune = now;
	const cutoff = now - AUDIT_RETENTION_DAYS * 86_400_000;
	db.delete(accessLog).where(lt(accessLog.at, cutoff)).run();
	db.delete(activityLog).where(lt(activityLog.at, cutoff)).run();
}

export function logAccess(
	db: Db,
	e: {
		event: AccessEvent;
		username: string;
		userId?: string | null;
		ip?: string;
		userAgent?: string | null;
	},
	now = Date.now()
) {
	db.insert(accessLog)
		.values({
			at: now,
			event: e.event,
			username: e.username.trim().toLowerCase().slice(0, 64),
			userId: e.userId ?? null,
			ip: (e.ip ?? '').slice(0, 64),
			userAgent: summarizeUserAgent(e.userAgent)
		})
		.run();
	pruneOccasionally(db, now);
}

export interface ActivityInput {
	userId: string;
	action: string;
	entity: string;
	entityId?: string;
	label?: string;
	detail?: Record<string, unknown>;
	at?: number;
}

export function logActivity(db: Db, a: ActivityInput, now = Date.now()) {
	db.insert(activityLog)
		.values({
			at: a.at ?? now,
			receivedAt: now,
			userId: a.userId,
			action: a.action,
			entity: a.entity,
			entityId: a.entityId ?? '',
			label: (a.label ?? '').slice(0, 160),
			detail: a.detail ? JSON.stringify(a.detail).slice(0, 2000) : ''
		})
		.run();
	pruneOccasionally(db, now);
}

export const PAGE_SIZE = 50;

const parseCursor = (c: string | null | undefined) => {
	const m = /^(\d+):(\d+)$/.exec(c ?? '');
	return m ? { at: Number(m[1]), id: Number(m[2]) } : null;
};

export function listAccess(
	db: Db,
	opts: { cursor?: string | null; q?: string | null; event?: string | null; limit?: number } = {}
) {
	const limit = Math.min(opts.limit ?? PAGE_SIZE, 200);
	const where: SQL[] = [];
	const c = parseCursor(opts.cursor);
	if (c)
		where.push(or(lt(accessLog.at, c.at), and(eq(accessLog.at, c.at), lt(accessLog.id, c.id)))!);
	if (opts.event) where.push(eq(accessLog.event, opts.event as AccessEvent));
	if (opts.q)
		where.push(or(like(accessLog.username, `%${opts.q}%`), like(accessLog.ip, `%${opts.q}%`))!);
	const rows = db
		.select()
		.from(accessLog)
		.where(where.length ? and(...where) : undefined)
		.orderBy(desc(accessLog.at), desc(accessLog.id))
		.limit(limit + 1)
		.all();
	const more = rows.length > limit;
	const page = rows.slice(0, limit);
	const last = page[page.length - 1];
	return { entries: page, next: more && last ? `${last.at}:${last.id}` : null };
}

export function listActivity(
	db: Db,
	opts: {
		cursor?: string | null;
		q?: string | null;
		entity?: string | null;
		userId?: string | null;
		limit?: number;
	} = {}
) {
	const limit = Math.min(opts.limit ?? PAGE_SIZE, 200);
	const where: SQL[] = [];
	const c = parseCursor(opts.cursor);
	if (c)
		where.push(
			or(lt(activityLog.at, c.at), and(eq(activityLog.at, c.at), lt(activityLog.id, c.id)))!
		);
	if (opts.entity) where.push(eq(activityLog.entity, opts.entity));
	if (opts.userId) where.push(eq(activityLog.userId, opts.userId));
	if (opts.q)
		where.push(
			or(like(activityLog.label, `%${opts.q}%`), like(activityLog.detail, `%${opts.q}%`))!
		);
	const rows = db
		.select({
			id: activityLog.id,
			at: activityLog.at,
			receivedAt: activityLog.receivedAt,
			userId: activityLog.userId,
			username: sql<
				string | null
			>`(select ${users.username} from ${users} where ${users.id} = ${activityLog.userId})`,
			action: activityLog.action,
			entity: activityLog.entity,
			entityId: activityLog.entityId,
			label: activityLog.label,
			detail: activityLog.detail
		})
		.from(activityLog)
		.where(where.length ? and(...where) : undefined)
		.orderBy(desc(activityLog.at), desc(activityLog.id))
		.limit(limit + 1)
		.all();
	const more = rows.length > limit;
	const page = rows
		.slice(0, limit)
		.map((r) => ({ ...r, detail: r.detail ? safeJson(r.detail) : null }));
	const last = page[page.length - 1];
	return { entries: page, next: more && last ? `${last.at}:${last.id}` : null };
}

function safeJson(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}
