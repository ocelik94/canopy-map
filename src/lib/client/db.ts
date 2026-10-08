import Dexie, { type EntityTable } from 'dexie';
import type {
	CategoryRow,
	DeviceInput,
	DeviceTypeRow,
	LocationEventInput,
	Mutation,
	StatusEventInput,
	StatusRow
} from '../shared/schemas.ts';

export type LocalDevice = DeviceInput & { updatedBy?: string; seq?: number };
export type LocalStatusEvent = StatusEventInput & { userId?: string };
export type LocalLocationEvent = LocationEventInput & { userId?: string };
export interface LocalPhoto {
	id: string;
	deviceId: string;
	mime: string;
	createdAt: number;
	blob?: Blob;
	uploaded: 0 | 1;
}
export interface OutboxItem {
	n?: number;
	id: string;
	mutation: Mutation;
	createdAt: number;
}
export interface MetaRow {
	key: string;
	value: unknown;
}
export interface TileArea {
	id: string;
	name: string;
	bounds: [number, number, number, number];
	minZoom: number;
	maxZoom: number;
	tiles: number;
	downloadedAt: number;
}

export class LocalDb extends Dexie {
	devices!: EntityTable<LocalDevice, 'id'>;
	deviceTypes!: EntityTable<DeviceTypeRow, 'id'>;
	categories!: EntityTable<CategoryRow, 'id'>;
	statuses!: EntityTable<StatusRow, 'id'>;
	statusHistory!: EntityTable<LocalStatusEvent, 'id'>;
	locationHistory!: EntityTable<LocalLocationEvent, 'id'>;
	photos!: EntityTable<LocalPhoto, 'id'>;
	outbox!: EntityTable<OutboxItem, 'n'>;
	meta!: EntityTable<MetaRow, 'key'>;
	tileAreas!: EntityTable<TileArea, 'id'>;

	constructor(name = 'canopy', options?: ConstructorParameters<typeof Dexie>[1]) {
		super(name, options);
		this.version(1).stores({
			devices: 'id, deviceTypeId, categoryId, statusId, siteGroup, updatedAt, deletedAt',
			deviceTypes: 'id',
			categories: 'id',
			statuses: 'id',
			statusHistory: 'id, deviceId, createdAt',
			locationHistory: 'id, deviceId, recordedAt',
			photos: 'id, deviceId, uploaded',
			outbox: '++n, id',
			meta: 'key',
			tileAreas: 'id'
		});
	}
}

export async function getMeta<T>(db: LocalDb, key: string, fallback: T): Promise<T> {
	const row = await db.meta.get(key);
	return (row?.value as T) ?? fallback;
}
export const setMeta = (db: LocalDb, key: string, value: unknown) => db.meta.put({ key, value });
