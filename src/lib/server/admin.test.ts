import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { openDb, type Db } from './db/index.ts';
import { createUser } from './auth.ts';
import { deleteEntity, saveSettings, updateUser, upsertEntity, ValidationError } from './admin.ts';
import { pullChanges, getSettings } from './sync.ts';

let db: Db;
beforeEach(() => {
	db = openDb(':memory:', path.resolve('drizzle'));
});

describe('seed data', () => {
	it('seeds the two device types and nine statuses', () => {
		const p = pullChanges(db, 0);
		expect(p.changes.deviceTypes.map((t) => t.name)).toEqual([
			'Stationary recorder',
			'Mobile recorder'
		]);
		expect(p.changes.statuses).toHaveLength(9);
	});
});

describe('reference data', () => {
	it('upserts appear in the next pull; soft delete is a tombstone, not a removal', () => {
		const before = pullChanges(db, 0).cursor;
		upsertEntity(db, 'categories', {
			id: 'cat-north',
			name: 'North ridge',
			color: '#112233',
			icon: '🌲'
		});
		let p = pullChanges(db, before);
		expect(p.changes.categories.map((c) => c.id)).toEqual(['cat-north']);
		deleteEntity(db, 'categories', 'cat-north');
		p = pullChanges(db, p.cursor);
		expect(p.changes.categories[0].deletedAt).not.toBeNull();
	});

	it('rejects invalid colors', () => {
		expect(() =>
			upsertEntity(db, 'statuses', { id: 's', name: 'x', color: 'red', icon: 'x' })
		).toThrow(ValidationError);
	});

	it('validates and stores settings', () => {
		saveSettings(db, { maintenanceDays: 45, rotationDate: '2027-03-01' });
		expect(getSettings(db)).toEqual({ maintenanceDays: 45, rotationDate: '2027-03-01' });
		expect(() => saveSettings(db, { maintenanceDays: 0, rotationDate: '' })).toThrow(
			ValidationError
		);
	});
});

describe('user management', () => {
	it('refuses to disable or demote the last admin', async () => {
		const a = await createUser(db, {
			username: 'root',
			password: 'a long password',
			role: 'admin'
		});
		const b = await createUser(db, { username: 'bob', password: 'a long password', role: 'user' });
		await expect(updateUser(db, b.id, a.id, { disabled: true })).rejects.toThrow(
			/last active admin/
		);
		await expect(updateUser(db, b.id, a.id, { role: 'user' })).rejects.toThrow(/last active admin/);
		await updateUser(db, a.id, b.id, { role: 'admin' });
		await updateUser(db, b.id, a.id, { disabled: true });
	});

	it('resetting a password invalidates existing sessions', async () => {
		const { createSession, validateSession } = await import('./auth.ts');
		const a = await createUser(db, {
			username: 'root',
			password: 'a long password',
			role: 'admin'
		});
		const s = createSession(db, a.id);
		await updateUser(db, a.id, a.id, { password: 'another long password' });
		expect(validateSession(db, s.token)).toBeNull();
	});
});
