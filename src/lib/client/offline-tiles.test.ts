import { describe, expect, it } from 'vitest';
import {
	MAX_AREA_TILES,
	countTiles,
	estimateTiles,
	latToTileY,
	lonToTileX,
	tileInArea,
	tilesForBounds
} from './offline-tiles.ts';

describe('tile math', () => {
	it('matches known XYZ values', () => {
		expect(lonToTileX(13.405, 10)).toBe(550);
		expect(latToTileY(52.52, 10)).toBe(335);
		expect(lonToTileX(0, 0)).toBe(0);
		expect(latToTileY(0, 1)).toBe(1);
	});
	it('whole world at z0 is one tile', () => {
		expect([...tilesForBounds([-180, -90, 180, 90], 0, 0)]).toEqual([{ z: 0, x: 0, y: 0 }]);
	});
	it('count equals enumeration', () => {
		const b: [number, number, number, number] = [13.3, 52.4, 13.5, 52.6];
		const all = [...tilesForBounds(b, 8, 13)];
		expect(all.length).toBe(countTiles(b, 8, 13));
		expect(new Set(all.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(all.length);
	});
	it('a point-sized box yields one tile per zoom', () => {
		expect(countTiles([13.4, 52.5, 13.4, 52.5], 0, 10)).toBe(11);
	});
	it('handles antimeridian crossing', () => {
		const tiles = [...tilesForBounds([179, 0, -179, 1], 3, 3)];
		expect([...new Set(tiles.map((t) => t.x))].sort()).toEqual([0, 7]);
	});
	it('flags oversize areas', () => {
		expect(estimateTiles([-10, 40, 10, 60], 0, 14).tooMany).toBe(true);
		expect(estimateTiles([13.3, 52.4, 13.5, 52.6], 0, 12)).toMatchObject({ tooMany: false });
		expect(MAX_AREA_TILES).toBe(60000);
	});
	it('tileInArea agrees with enumeration', () => {
		const a = {
			bounds: [13.3, 52.4, 13.5, 52.6] as [number, number, number, number],
			minZoom: 9,
			maxZoom: 11
		};
		for (const t of tilesForBounds(a.bounds, 9, 11)) expect(tileInArea(a, t)).toBe(true);
		expect(tileInArea(a, { z: 10, x: 0, y: 0 })).toBe(false);
		expect(tileInArea(a, { z: 12, x: 2200, y: 1340 })).toBe(false);
	});
});

describe('tile versioning', async () => {
	const { tileUrl } = await import('./offline-tiles.ts');
	const { withTileVersion } = await import('./map-style.ts');
	it('puts the archive version in tile URLs', () => {
		expect(tileUrl({ z: 1, x: 2, y: 3 })).toBe('/tiles/1/2/3.mvt');
		expect(tileUrl({ z: 1, x: 2, y: 3 }, 'abc123')).toBe('/tiles/1/2/3.mvt?v=abc123');
	});
	it('versions every tile template in a style, without touching the input', () => {
		const style = { sources: { omt: { tiles: ['https://h/tiles/{z}/{x}/{y}.mvt'] } } };
		const out = withTileVersion(style, 'v2');
		expect(out.sources!.omt.tiles).toEqual(['https://h/tiles/{z}/{x}/{y}.mvt?v=v2']);
		expect(style.sources.omt.tiles[0]).not.toContain('v=');
		expect(withTileVersion(style, '')).toBe(style);
	});
});
