import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
	Compression,
	PMTiles,
	TileType,
	findTile,
	zxyToTileId,
	type Header,
	type RangeResponse,
	type Source
} from 'pmtiles';
import { config } from '#lib/server/config.ts';

export class NodeFileSource implements Source {
	private fd?: number;
	constructor(
		readonly filePath: string,
		private readonly key: string
	) {}
	getKey() {
		return this.key;
	}
	async getBytes(offset: number, length: number): Promise<RangeResponse> {
		this.fd ??= fs.openSync(this.filePath, 'r');
		const fd = this.fd;
		const buf = Buffer.allocUnsafe(length);
		let read = 0;
		while (read < length) {
			const bytesRead = await new Promise<number>((resolve, reject) =>
				fs.read(fd, buf, read, length - read, offset + read, (err, n) =>
					err ? reject(err) : resolve(n)
				)
			);
			if (bytesRead === 0) break;
			read += bytesRead;
		}
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + read) as ArrayBuffer;
		return { data: ab };
	}
	async close() {
		const fd = this.fd;
		this.fd = undefined;
		if (fd !== undefined) {
			try {
				fs.closeSync(fd);
			} catch {}
		}
	}
}

export interface TileInfo {
	installed: boolean;
	name?: string;
	bounds?: [number, number, number, number];
	center?: [number, number, number];
	minzoom?: number;
	maxzoom?: number;
	attribution?: string;
	format?: string;
	compression?: string;
	version?: string;
}

export type TileResult =
	| { kind: 'none' }
	| { kind: 'empty' }
	| { kind: 'unsupported'; reason: string }
	| { kind: 'tile'; data: Uint8Array; encoding: 'gzip' | 'br' | null };

export function parseTileParams(
	z: string,
	x: string,
	file: string
): { z: number; x: number; y: number } | null {
	const m = /^(\d{1,8})\.(?:mvt|pbf)$/.exec(file);
	if (!m || !/^\d{1,2}$/.test(z) || !/^\d{1,8}$/.test(x)) return null;
	const zi = Number(z);
	const xi = Number(x);
	const yi = Number(m[1]);
	if (zi > 24) return null;
	const n = 2 ** zi;
	if (xi >= n || yi >= n) return null;
	return { z: zi, x: xi, y: yi };
}

const COMPRESSION = ['unknown', 'none', 'gzip', 'brotli', 'zstd'];

interface Loaded {
	pm: PMTiles;
	source: NodeFileSource;
	header: Header;
	file: string;
	sig: string;
	metadata: Record<string, unknown>;
}

async function rawTile(
	a: Loaded,
	z: number,
	x: number,
	y: number
): Promise<RangeResponse | undefined> {
	const h = a.header;
	const tileId = zxyToTileId(z, x, y);
	let offset = h.rootDirectoryOffset;
	let length = h.rootDirectoryLength;
	for (let depth = 0; depth <= 3; depth++) {
		const dir = await a.pm.cache.getDirectory(a.source, offset, length, h);
		const entry = findTile(dir, tileId);
		if (!entry) return undefined;
		if (entry.runLength > 0)
			return a.source.getBytes(h.tileDataOffset + entry.offset, entry.length);
		offset = h.leafDirectoryOffset + entry.offset;
		length = entry.length;
	}
	throw new Error('PMTiles directory depth exceeded');
}

export function createTileService(dir: string | (() => string)) {
	const getDir = typeof dir === 'function' ? dir : () => dir;
	let loaded: Loaded | null | undefined;
	let checkedAt = 0;
	let loading: Promise<Loaded | null> | undefined;

	function findArchive(): { file: string; sig: string } | null {
		let names: string[];
		try {
			names = fs.readdirSync(getDir()).filter((n) => n.toLowerCase().endsWith('.pmtiles'));
		} catch {
			return null;
		}
		names.sort();
		for (const n of names) {
			const file = path.join(getDir(), n);
			try {
				const st = fs.statSync(file);
				if (st.isFile() && st.size > 127) return { file, sig: `${file}:${st.size}:${st.mtimeMs}` };
			} catch {}
		}
		return null;
	}

	async function load(): Promise<Loaded | null> {
		const now = Date.now();
		if (loaded !== undefined && now - checkedAt < 5000) return loaded;
		if (loading) return loading;
		loading = (async () => {
			const found = findArchive();
			checkedAt = Date.now();
			if (!found) {
				await loaded?.source.close();
				loaded = null;
				return null;
			}
			if (loaded && loaded.sig === found.sig) return loaded;
			await loaded?.source.close();
			const source = new NodeFileSource(found.file, found.sig);
			const pm = new PMTiles(source);
			try {
				const header = await pm.getHeader();
				let metadata: Record<string, unknown> = {};
				try {
					metadata = ((await pm.getMetadata()) as Record<string, unknown>) ?? {};
				} catch {}
				loaded = { pm, source, header, metadata, ...found };
			} catch (e) {
				await source.close();
				console.error(`[canopy] cannot read PMTiles archive ${path.basename(found.file)}`);
				loaded = null;
				void e;
			}
			return loaded;
		})();
		try {
			return await loading;
		} finally {
			loading = undefined;
		}
	}

	async function info(): Promise<TileInfo> {
		const a = await load();
		if (!a) return { installed: false };
		const h = a.header;
		const md = a.metadata;
		return {
			installed: true,
			name: typeof md.name === 'string' ? md.name : path.basename(a.file, '.pmtiles'),
			bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat],
			center: [h.centerLon, h.centerLat, h.centerZoom],
			minzoom: h.minZoom,
			maxzoom: h.maxZoom,
			attribution: typeof md.attribution === 'string' ? md.attribution : undefined,
			format: h.tileType === TileType.Mvt ? 'mvt' : String(h.tileType),
			compression: COMPRESSION[h.tileCompression] ?? 'unknown',
			version: createHash('sha256')
				.update(`${path.basename(a.file)}:${a.sig.split(':').slice(-2).join(':')}`)
				.digest('hex')
				.slice(0, 12)
		};
	}

	async function tile(z: number, x: number, y: number): Promise<TileResult> {
		const a = await load();
		if (!a) return { kind: 'none' };
		const h = a.header;
		if (h.tileType !== TileType.Mvt) return { kind: 'unsupported', reason: 'archive is not MVT' };
		if (z < h.minZoom || z > h.maxZoom) return { kind: 'empty' };
		let res: RangeResponse | undefined;
		try {
			res = await rawTile(a, z, x, y);
		} catch (e) {
			checkedAt = 0;
			loaded = undefined;
			throw e;
		}
		if (!res || res.data.byteLength === 0) return { kind: 'empty' };
		const data = new Uint8Array(res.data);
		switch (h.tileCompression) {
			case Compression.None:
				return { kind: 'tile', data, encoding: null };
			case Compression.Gzip:
				return { kind: 'tile', data, encoding: 'gzip' };
			case Compression.Brotli:
				return { kind: 'tile', data, encoding: 'br' };
			default:
				return { kind: 'unsupported', reason: 'unsupported tile compression' };
		}
	}

	async function close() {
		await loaded?.source.close();
		loaded = undefined;
	}

	return { info, tile, close };
}

const g = globalThis as { __canopyTiles?: ReturnType<typeof createTileService> };
export const tileService = () => (g.__canopyTiles ??= createTileService(() => config.tilesDir));
