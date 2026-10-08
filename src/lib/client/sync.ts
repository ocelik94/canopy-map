import type { LocalDb } from './db.ts';
import { getMeta, setMeta } from './db.ts';
import type { MutationResult, PullResponse } from '../shared/schemas.ts';

export class NetworkError extends Error {}
export class AuthError extends Error {}

export interface Transport {
	push(mutations: unknown[]): Promise<MutationResult[]>;
	pull(since: number): Promise<PullResponse>;
	uploadPhoto?(photo: {
		id: string;
		deviceId: string;
		mime: string;
		createdAt: number;
		blob: Blob;
	}): Promise<void>;
	health?(): Promise<boolean>;
}

export interface SyncState {
	online: boolean;
	syncing: boolean;
	pending: number;
	lastSyncAt: number | null;
	error: string | null;
	needsLogin: boolean;
}
export interface SyncIssue {
	at: number;
	mutationId: string;
	reason: string;
}

const BATCH = 100;

export function createSyncEngine(opts: {
	db: LocalDb;
	transport: Transport;
	now?: () => number;
	onState?: (s: SyncState) => void;
}) {
	const { db, transport } = opts;
	const now = opts.now ?? Date.now;
	let running: Promise<SyncState> | null = null;
	let state: SyncState = {
		online: true,
		syncing: false,
		pending: 0,
		lastSyncAt: null,
		error: null,
		needsLogin: false
	};
	const set = (patch: Partial<SyncState>) => {
		state = { ...state, ...patch };
		opts.onState?.(state);
	};

	async function refreshPending() {
		const pendingPhotos = await db.photos.where('uploaded').equals(0).count();
		set({ pending: (await db.outbox.count()) + pendingPhotos });
	}

	async function pushAll() {
		for (;;) {
			const batch = await db.outbox.orderBy('n').limit(BATCH).toArray();
			if (!batch.length) return;
			const results = await transport.push(batch.map((b) => b.mutation));
			const byId = new Map(results.map((r) => [r.id, r]));
			const issues: SyncIssue[] = [];
			for (const item of batch) {
				const r = byId.get(item.id);
				if (!r) throw new NetworkError('Incomplete push response');
				if (r.result === 'rejected')
					issues.push({ at: now(), mutationId: item.id, reason: r.reason ?? 'rejected' });
			}
			await db.transaction('rw', [db.outbox, db.meta], async () => {
				await db.outbox.bulkDelete(batch.map((b) => b.n!));
				if (issues.length) {
					const prev = await getMeta<SyncIssue[]>(db, 'issues', []);
					await setMeta(db, 'issues', [...prev, ...issues].slice(-50));
				}
			});
			await refreshPending();
		}
	}

	async function pushPhotos() {
		if (!transport.uploadPhoto) return;
		for (const p of await db.photos.where('uploaded').equals(0).toArray()) {
			if (!p.blob) continue;
			await transport.uploadPhoto({ ...p, blob: p.blob });
			await db.photos.update(p.id, { uploaded: 1 });
		}
	}

	async function pullAll() {
		for (;;) {
			const since = await getMeta<number>(db, 'cursor', 0);
			const res = await transport.pull(since);
			await applyPull(db, res);
			if (!res.hasMore) return;
		}
	}

	async function run(): Promise<SyncState> {
		set({ syncing: true });
		try {
			await pushAll();
			await pushPhotos();
			await pullAll();
			await setMeta(db, 'lastSyncAt', now());
			set({ online: true, error: null, needsLogin: false, lastSyncAt: now() });
		} catch (e) {
			if (e instanceof NetworkError) set({ online: false, error: null });
			else if (e instanceof AuthError)
				set({ needsLogin: true, error: 'Session expired. Sign in again.' });
			else set({ error: e instanceof Error ? e.message : 'Sync failed' });
		} finally {
			await refreshPending();
			set({ syncing: false });
		}
		return state;
	}

	return {
		get state() {
			return state;
		},
		sync(): Promise<SyncState> {
			return (running ??= run().finally(() => (running = null)));
		},
		refreshPending,
		async init() {
			set({ lastSyncAt: await getMeta<number | null>(db, 'lastSyncAt', null) });
			await refreshPending();
		},
		setOnline(online: boolean) {
			set({ online });
		}
	};
}

export async function applyPull(db: LocalDb, res: PullResponse) {
	const c = res.changes;
	await db.transaction(
		'rw',
		[
			db.devices,
			db.deviceTypes,
			db.categories,
			db.statuses,
			db.statusHistory,
			db.locationHistory,
			db.photos,
			db.outbox,
			db.meta
		],
		async () => {
			const pendingIds = new Set(
				(await db.outbox.toArray())
					.filter((o) => o.mutation.kind === 'device.upsert')
					.map((o) => (o.mutation as { device: { id: string } }).device.id)
			);
			for (const d of c.devices) {
				const local = await db.devices.get(d.id);
				if (local && pendingIds.has(d.id) && local.updatedAt > d.updatedAt) continue;
				if (!local || d.updatedAt >= local.updatedAt) await db.devices.put(d);
			}
			await db.deviceTypes.bulkPut(c.deviceTypes);
			await db.categories.bulkPut(c.categories);
			await db.statuses.bulkPut(c.statuses);
			await db.statusHistory.bulkPut(c.statusHistory);
			await db.locationHistory.bulkPut(c.locationHistory);
			for (const p of c.photos) {
				const local = await db.photos.get(p.id);
				await db.photos.put({ ...(local ?? {}), ...p, uploaded: 1 });
			}
			await setMeta(db, 'cursor', res.cursor);
			await setMeta(db, 'settings', res.settings);
			await setMeta(db, 'users', res.users);
		}
	);
}
