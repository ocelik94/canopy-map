import { liveQuery } from 'dexie';
import { goto } from '$app/navigation';
import { LocalDb, getMeta, setMeta } from './db.ts';
import { createSyncEngine, type SyncState } from './sync.ts';
import { httpTransport } from './transport.ts';
import type { Ctx } from './repo.ts';
import type { Settings } from '../shared/schemas.ts';
import { ensurePersistentStorage, type StorageProtection } from './storage.ts';

export interface AppUser {
	id: string;
	username: string;
	role: 'admin' | 'user';
}

export function live<T>(query: () => T | Promise<T>, initial: T) {
	let value = $state(initial) as T;
	$effect(() => {
		const sub = liveQuery(query).subscribe({ next: (v) => (value = v) });
		return () => sub.unsubscribe();
	});
	return {
		get value() {
			return value;
		}
	};
}

class App {
	db = new LocalDb();
	user = $state<AppUser | null>(null);
	csrf = '';
	ready = $state(false);
	storage = $state<StorageProtection | null>(null);
	sync = $state<SyncState>({
		online: typeof navigator === 'undefined' ? true : navigator.onLine,
		syncing: false,
		pending: 0,
		lastSyncAt: null,
		error: null,
		needsLogin: false
	});
	engine = createSyncEngine({
		db: this.db,
		transport: httpTransport(() => this.csrf),
		onState: (s) => (this.sync = s)
	});
	private started = false;

	ctx(): Ctx {
		return { db: this.db, userId: this.user?.id };
	}

	async settings(): Promise<Settings> {
		return getMeta<Settings>(this.db, 'settings', { maintenanceDays: 90, rotationDate: '' });
	}

	async init() {
		if (this.started) return;
		this.started = true;
		try {
			const res = await fetch('/api/me', { cache: 'no-store' });
			if (res.status === 401) {
				await this.db.meta.bulkDelete(['user', 'csrf']);
				await goto('/login');
				return;
			}
			const j = await res.json();
			this.user = j.user;
			this.csrf = j.csrfToken;
			await setMeta(this.db, 'user', j.user);
			await setMeta(this.db, 'csrf', j.csrfToken);
		} catch {
			this.user = await getMeta<AppUser | null>(this.db, 'user', null);
			this.csrf = await getMeta<string>(this.db, 'csrf', '');
			if (!this.user) {
				await goto('/login');
				return;
			}
		}
		await this.engine.init();
		liveQuery(
			async () =>
				(await this.db.outbox.count()) + (await this.db.photos.where('uploaded').equals(0).count())
		).subscribe({
			next: (pending) => (this.sync = { ...this.sync, pending })
		});
		this.ready = true;
		void ensurePersistentStorage().then((r) => (this.storage = r));
		void this.engine.sync();

		window.addEventListener('online', () => void this.engine.sync());
		window.addEventListener('offline', () => this.engine.setOnline(false));
		setInterval(async () => {
			const ok = (await this.engine.state.online) && navigator.onLine;
			if (!navigator.onLine) return this.engine.setOnline(false);
			const health = await fetch('/api/health', { cache: 'no-store' }).then(
				(r) => r.ok,
				() => false
			);
			this.engine.setOnline(health);
			if (health && (this.engine.state.pending > 0 || !ok)) void this.engine.sync();
		}, 30_000);
	}
}

export const app = new App();
