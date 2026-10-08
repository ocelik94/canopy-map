import type { LocalDb, TileArea } from './db.ts';

export const TILE_CACHE = 'canopy-tiles';
export const MAX_AREA_TILES = 60_000;
export const AVG_TILE_BYTES = 20 * 1024;
const CONCURRENCY = 6;
const MAX_LAT = 85.0511287798;

export type Bounds = [west: number, south: number, east: number, north: number];
export interface Tile {
	z: number;
	x: number;
	y: number;
}

export const tileUrl = (t: Tile, version = '') =>
	`/tiles/${t.z}/${t.x}/${t.y}.mvt${version ? `?v=${encodeURIComponent(version)}` : ''}`;

export async function tileVersion(): Promise<string> {
	try {
		const res = await fetch('/tiles/info.json');
		const j = (await res.json()) as { installed?: boolean; version?: string };
		return j.installed && j.version ? j.version : '';
	} catch {
		return '';
	}
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function lonToTileX(lon: number, z: number): number {
	const n = 2 ** z;
	return clamp(Math.floor(((lon + 180) / 360) * n), 0, n - 1);
}
export function latToTileY(lat: number, z: number): number {
	const n = 2 ** z;
	const r = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
	return clamp(
		Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
		0,
		n - 1
	);
}

function xRanges(west: number, east: number, z: number): [number, number][] {
	if (west <= east) return [[lonToTileX(west, z), lonToTileX(east, z)]];
	return [
		[lonToTileX(west, z), 2 ** z - 1],
		[0, lonToTileX(east, z)]
	];
}

export function countTiles(bounds: Bounds, minZoom: number, maxZoom: number): number {
	const [w, s, e, n] = bounds;
	let total = 0;
	for (let z = minZoom; z <= maxZoom; z++) {
		const y = latToTileY(s, z) - latToTileY(n, z) + 1;
		for (const [x0, x1] of xRanges(w, e, z)) total += (x1 - x0 + 1) * y;
	}
	return total;
}

export function* tilesForBounds(bounds: Bounds, minZoom: number, maxZoom: number): Generator<Tile> {
	const [w, s, e, n] = bounds;
	for (let z = minZoom; z <= maxZoom; z++) {
		const y0 = latToTileY(n, z);
		const y1 = latToTileY(s, z);
		for (const [x0, x1] of xRanges(w, e, z))
			for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield { z, x, y };
	}
}

export function estimateTiles(bounds: Bounds, minZoom: number, maxZoom: number) {
	const tiles = countTiles(bounds, minZoom, maxZoom);
	return { tiles, bytes: tiles * AVG_TILE_BYTES, tooMany: tiles > MAX_AREA_TILES };
}

export interface AreaRequest {
	bounds: Bounds;
	minZoom: number;
	maxZoom: number;
	name: string;
}
export interface Progress {
	done: number;
	total: number;
	failed: number;
}

export class AreaTooLargeError extends Error {
	constructor(public tiles: number) {
		super(
			`This area needs ${tiles.toLocaleString()} tiles; the limit is ${MAX_AREA_TILES.toLocaleString()}. Zoom the map in or lower the maximum zoom.`
		);
	}
}

async function fetchOne(
	cache: Cache,
	t: Tile,
	version: string,
	signal?: AbortSignal
): Promise<'cached' | 'ok' | 'fail'> {
	const url = tileUrl(t, version);
	if (await cache.match(url)) return 'cached';
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(url, { signal });
			if (res.ok) {
				await cache.put(url, res);
				return 'ok';
			}
			if (res.status === 404 || res.status === 400) return 'fail';
		} catch (e) {
			if (signal?.aborted) throw e;
		}
	}
	return 'fail';
}

export async function downloadArea(
	area: AreaRequest,
	db: LocalDb,
	onProgress?: (p: Progress) => void,
	signal?: AbortSignal
): Promise<TileArea> {
	const total = countTiles(area.bounds, area.minZoom, area.maxZoom);
	if (total > MAX_AREA_TILES) throw new AreaTooLargeError(total);
	const cache = await caches.open(TILE_CACHE);
	const version = await tileVersion();
	const it = tilesForBounds(area.bounds, area.minZoom, area.maxZoom);
	const p: Progress = { done: 0, total, failed: 0 };
	onProgress?.({ ...p });

	async function worker() {
		for (;;) {
			signal?.throwIfAborted();
			const next = it.next();
			if (next.done) return;
			const r = await fetchOne(cache, next.value, version, signal);
			p.done++;
			if (r === 'fail') p.failed++;
			onProgress?.({ ...p });
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	if (p.failed > 0)
		throw new Error(
			`${p.failed} of ${total} tiles could not be downloaded. Check the connection and try again.`
		);

	const record: TileArea = {
		id: crypto.randomUUID(),
		name: area.name,
		bounds: area.bounds,
		minZoom: area.minZoom,
		maxZoom: area.maxZoom,
		tiles: total,
		downloadedAt: Date.now()
	};
	await db.tileAreas.put(record);
	return record;
}

export async function deleteArea(db: LocalDb, id: string): Promise<void> {
	const area = await db.tileAreas.get(id);
	if (!area) return;
	await db.tileAreas.delete(id);
	const others = await db.tileAreas.toArray();
	const cache = await caches.open(TILE_CACHE);
	for (const t of tilesForBounds(area.bounds, area.minZoom, area.maxZoom)) {
		if (others.some((o) => tileInArea(o, t))) continue;
		await cache.delete(tileUrl(t));
	}
}

export function tileInArea(a: Pick<TileArea, 'bounds' | 'minZoom' | 'maxZoom'>, t: Tile): boolean {
	if (t.z < a.minZoom || t.z > a.maxZoom) return false;
	const [w, s, e, n] = a.bounds;
	const y0 = latToTileY(n, t.z);
	const y1 = latToTileY(s, t.z);
	if (t.y < y0 || t.y > y1) return false;
	return xRanges(w, e, t.z).some(([x0, x1]) => t.x >= x0 && t.x <= x1);
}

export const formatBytes = (b: number) =>
	b < 1024 * 1024
		? `${Math.round(b / 1024)} KB`
		: `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
