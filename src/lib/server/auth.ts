import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from './db';
import { sessions, users, loginAttempts } from './db/schema.ts';
import { config } from './config.ts';

export const SESSION_COOKIE = 'canopy_session';

export type Role = 'admin' | 'user';
export interface SessionUser {
	id: string;
	username: string;
	role: Role;
}

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, ARGON);

let dummyHash: Promise<string> | undefined;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function validatePasswordStrength(pw: string): string | null {
	if (pw.length < 10) return 'Password must be at least 10 characters.';
	if (pw.length > 256) return 'Password is too long.';
	return null;
}

export async function createUser(
	db: Db,
	input: { username: string; password: string; role: Role }
): Promise<SessionUser> {
	const weak = validatePasswordStrength(input.password);
	if (weak) throw new Error(weak);
	const id = randomUUID();
	db.insert(users)
		.values({
			id,
			username: input.username.trim().toLowerCase(),
			passwordHash: await hashPassword(input.password),
			role: input.role,
			createdAt: Date.now()
		})
		.run();
	return { id, username: input.username.trim().toLowerCase(), role: input.role };
}

export async function ensureInitialAdmin(db: Db) {
	if (db.select({ id: users.id }).from(users).limit(1).all().length > 0) return;
	if (!config.adminUsername || !config.adminPassword) {
		console.warn(
			'[canopy] No users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD, or run `pnpm create-admin`.'
		);
		return;
	}
	await createUser(db, {
		username: config.adminUsername,
		password: config.adminPassword,
		role: 'admin'
	});
	console.log(`[canopy] Created initial admin "${config.adminUsername}".`);
}

export async function authenticate(
	db: Db,
	username: string,
	password: string
): Promise<SessionUser | null> {
	const row = db
		.select()
		.from(users)
		.where(eq(users.username, username.trim().toLowerCase()))
		.get();
	if (!row || row.disabled) {
		dummyHash ??= hashPassword('canopy-dummy-password');
		await verify(await dummyHash, password).catch(() => false);
		return null;
	}
	const ok = await verify(row.passwordHash, password).catch(() => false);
	return ok ? { id: row.id, username: row.username, role: row.role } : null;
}

export function createSession(db: Db, userId: string) {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = Date.now() + config.sessionDays * 86_400_000;
	const csrfToken = randomBytes(24).toString('base64url');
	db.insert(sessions)
		.values({ id: sha256(token), userId, expiresAt, csrfToken })
		.run();
	return { token, expiresAt, csrfToken };
}

export function validateSession(db: Db, token: string | undefined) {
	if (!token) return null;
	const row = db
		.select({
			sessionId: sessions.id,
			csrfToken: sessions.csrfToken,
			id: users.id,
			username: users.username,
			role: users.role,
			disabled: users.disabled
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, Date.now())))
		.get();
	if (!row || row.disabled) return null;
	return {
		user: { id: row.id, username: row.username, role: row.role } as SessionUser,
		csrfToken: row.csrfToken
	};
}

export function destroySession(db: Db, token: string | undefined) {
	if (token)
		db.delete(sessions)
			.where(eq(sessions.id, sha256(token)))
			.run();
	db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
}

export function loginThrottle(db: Db, key: string, now = Date.now()): number {
	const windowMs = config.loginWindowMinutes * 60_000;
	const row = db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
	if (!row || now - row.windowStart > windowMs) return 0;
	return row.count >= config.loginMaxAttempts
		? Math.ceil((row.windowStart + windowMs - now) / 1000)
		: 0;
}

export function recordLoginFailure(db: Db, key: string, now = Date.now()) {
	const windowMs = config.loginWindowMinutes * 60_000;
	const row = db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
	if (!row || now - row.windowStart > windowMs) {
		db.insert(loginAttempts)
			.values({ key, count: 1, windowStart: now })
			.onConflictDoUpdate({ target: loginAttempts.key, set: { count: 1, windowStart: now } })
			.run();
	} else {
		db.update(loginAttempts)
			.set({ count: row.count + 1 })
			.where(eq(loginAttempts.key, key))
			.run();
	}
}

export function clearLoginFailures(db: Db, key: string) {
	db.delete(loginAttempts).where(eq(loginAttempts.key, key)).run();
}
