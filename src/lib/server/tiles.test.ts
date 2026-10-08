import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zxyToTileId } from 'pmtiles';
import { createTileService, parseTileParams } from './tiles.ts';

function varint(n: number): number[] {
	const out: number[] = [];
	while (n >= 0x80) {
		out.push((n % 0x80) | 0x80);
		n = Math.floor(n / 0x80);
	}
	out.push(n);
	return out;
}

function buildArchive(tiles: { z: number; x: number; y: number; body: string }[]): Buffer {
	const sorted = tiles
		.map((t) => ({ id: zxyToTileId(t.z, t.x, t.y), data: zlib.gzipSync(Buffer.from(t.body)) }))
		.sort((a, b) => a.id - b.id);
	const entries: number[] = varint(sorted.length);
	let prev = 0;
	for (const e of sorted) {
		entries.push(...varint(e.id - prev));
		prev = e.id;
	}
	for (let i = 0; i < sorted.length; i++) entries.push(...varint(1));
	for (const e of sorted) entries.push(...varint(e.data.length));
	let off = 0;
	for (const e of sorted) {
		entries.push(...varint(off + 1));
		off += e.data.length;
	}
	const root = zlib.gzipSync(Buffer.from(entries));
	const meta = zlib.gzipSync(Buffer.from(JSON.stringify({ name: 'Test', attribution: '© OSM' })));
	const tileData = Buffer.concat(sorted.map((e) => e.data));
	const h = Buffer.alloc(127);
	h.write('PMTiles', 0, 'latin1');
	h[7] = 3;
	const u64 = (o: number, v: number) => h.writeBigUInt64LE(BigInt(v), o);
	u64(8, 127);
	u64(16, root.length);
	u64(24, 127 + root.length);
	u64(32, meta.length);
	u64(40, 127 + root.length + meta.length);
	u64(48, 0);
	u64(56, 127 + root.length + meta.length);
	u64(64, tileData.length);
	u64(72, sorted.length);
	u64(80, sorted.length);
	u64(88, sorted.length);
	h[96] = 1;
	h[97] = 2;
	h[98] = 2;
	h[99] = 1;
	h[100] = 0;
	h[101] = 5;
	h.writeInt32LE(-100_000_000, 102);
	h.writeInt32LE(-100_000_000, 106);
	h.writeInt32LE(100_000_000, 110);
	h.writeInt32LE(100_000_000, 114);
	h[118] = 2;
	return Buffer.concat([h, root, meta, tileData]);
}

describe('parseTileParams', () => {
	it('accepts valid tiles', () => {
		expect(parseTileParams('3', '4', '5.mvt')).toEqual({ z: 3, x: 4, y: 5 });
		expect(parseTileParams('0', '0', '0.pbf')).toEqual({ z: 0, x: 0, y: 0 });
	});
	it('rejects junk and out-of-range', () => {
		expect(parseTileParams('3', '8', '0.mvt')).toBeNull();
		expect(parseTileParams('3', '0', '8.mvt')).toBeNull();
		expect(parseTileParams('25', '0', '0.mvt')).toBeNull();
		expect(parseTileParams('a', '0', '0.mvt')).toBeNull();
		expect(parseTileParams('1', '0', '0.png')).toBeNull();
		expect(parseTileParams('1', '0', '../0.mvt')).toBeNull();
	});
});

describe('tile service', () => {
	let dir: string;
	beforeAll(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-tiles-'));
	});
	afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

	it('reports not installed for an empty directory', async () => {
		const svc = createTileService(dir);
		expect(await svc.info()).toEqual({ installed: false });
		expect((await svc.tile(0, 0, 0)).kind).toBe('none');
		await svc.close();
	});

	it('serves gzip tiles raw, 204-style empties and info', async () => {
		fs.writeFileSync(
			path.join(dir, 'test.pmtiles'),
			buildArchive([
				{ z: 0, x: 0, y: 0, body: 'root-tile' },
				{ z: 3, x: 2, y: 1, body: 'tile-3-2-1' }
			])
		);
		const svc = createTileService(dir);
		const info = await svc.info();
		expect(info).toMatchObject({
			installed: true,
			name: 'Test',
			minzoom: 0,
			maxzoom: 5,
			bounds: [-10, -10, 10, 10]
		});
		const r = await svc.tile(3, 2, 1);
		expect(r.kind).toBe('tile');
		if (r.kind === 'tile') {
			expect(r.encoding).toBe('gzip');
			expect(zlib.gunzipSync(r.data).toString()).toBe('tile-3-2-1');
		}
		expect((await svc.tile(3, 0, 0)).kind).toBe('empty');
		expect((await svc.tile(9, 0, 0)).kind).toBe('empty');
		await svc.close();
	});
});
