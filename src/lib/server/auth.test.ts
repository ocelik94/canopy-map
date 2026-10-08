import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { openDb, type Db } from './db/index.ts';
import {
	authenticate,
	createSession,
	createUser,
	destroySession,
	loginThrottle,
	recordLoginFailure,
	clearLoginFailures,
	validateSession
} from './auth.ts';
import { users } from './db/schema.ts';
import { eq } from 'drizzle-orm';

let db: Db;
beforeEach(() => {
	db = openDb(':memory:', path.resolve('drizzle'));
});

describe('passwords', () => {
	it('stores an argon2id hash, never the password', async () => {
		await createUser(db, { username: 'Ann', password: 'correct horse battery', role: 'admin' });
		const row = db.select().from(users).get()!;
		expect(row.passwordHash).toMatch(/^\$argon2id\$/);
		expect(row.passwordHash).not.toContain('correct horse');
		expect(row.username).toBe('ann');
	});

	it('rejects short passwords', async () => {
		await expect(
			createUser(db, { username: 'x', password: 'short', role: 'user' })
		).rejects.toThrow();
	});

	it('authenticates only with the right password; username is case-insensitive', async () => {
		await createUser(db, { username: 'ann', password: 'correct horse battery', role: 'user' });
		expect(await authenticate(db, 'ANN', 'correct horse battery')).toMatchObject({ role: 'user' });
		expect(await authenticate(db, 'ann', 'wrong password!!')).toBeNull();
		expect(await authenticate(db, 'nobody', 'correct horse battery')).toBeNull();
	});

	it('refuses disabled users', async () => {
		const u = await createUser(db, {
			username: 'ann',
			password: 'correct horse battery',
			role: 'user'
		});
		db.update(users).set({ disabled: true }).where(eq(users.id, u.id)).run();
		expect(await authenticate(db, 'ann', 'correct horse battery')).toBeNull();
	});
});

describe('sessions', () => {
	it('validates, expires and destroys sessions; token is stored hashed', async () => {
		const u = await createUser(db, {
			username: 'ann',
			password: 'correct horse battery',
			role: 'user'
		});
		const s = createSession(db, u.id);
		expect(validateSession(db, s.token)?.user.username).toBe('ann');
		expect(validateSession(db, 'garbage')).toBeNull();
		expect(validateSession(db, undefined)).toBeNull();
		expect(db.$client.prepare('select count(*) c from sessions where id = ?').get(s.token)).toEqual(
			{ c: 0 }
		);
		destroySession(db, s.token);
		expect(validateSession(db, s.token)).toBeNull();
	});

	it('rejects expired sessions', async () => {
		const u = await createUser(db, {
			username: 'ann',
			password: 'correct horse battery',
			role: 'user'
		});
		const s = createSession(db, u.id);
		db.$client.prepare('update sessions set expires_at = 1').run();
		expect(validateSession(db, s.token)).toBeNull();
	});

	it('invalidates sessions of a user who is later disabled', async () => {
		const u = await createUser(db, {
			username: 'ann',
			password: 'correct horse battery',
			role: 'user'
		});
		const s = createSession(db, u.id);
		db.update(users).set({ disabled: true }).where(eq(users.id, u.id)).run();
		expect(validateSession(db, s.token)).toBeNull();
	});
});

describe('login rate limit', () => {
	it('locks after N failures, resets after the window, and clears on success', () => {
		const t0 = 1_000_000;
		for (let i = 0; i < 5; i++) {
			expect(loginThrottle(db, 'u:ann', t0)).toBe(0);
			recordLoginFailure(db, 'u:ann', t0);
		}
		expect(loginThrottle(db, 'u:ann', t0 + 1000)).toBeGreaterThan(0);
		expect(loginThrottle(db, 'u:bob', t0 + 1000)).toBe(0);
		expect(loginThrottle(db, 'u:ann', t0 + 16 * 60_000)).toBe(0);
		clearLoginFailures(db, 'u:ann');
		expect(loginThrottle(db, 'u:ann', t0 + 1000)).toBe(0);
	});
});
