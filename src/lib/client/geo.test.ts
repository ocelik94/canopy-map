import { describe, expect, it } from 'vitest';
import {
	boundsOf,
	buildGeoJSON,
	filterDevices,
	fitSize,
	geoUri,
	iconId,
	NO_FILTERS,
	parseIconId,
	shapeFor
} from './geo.ts';
import type { LocalDevice } from './db.ts';

const dev = (o: Partial<LocalDevice>): LocalDevice => ({
	id: 'x',
	name: 'Alpha',
	serial: 'SN1',
	deviceTypeId: 'stationary',
	categoryId: null,
	statusId: 'rec',
	lat: 10,
	lon: 20,
	siteName: 'Ridge',
	siteGroup: 'North',
	deployedOn: null,
	lastServiceOn: null,
	retrievalDueOn: null,
	notes: '',
	createdAt: 1,
	updatedAt: 1,
	deletedAt: null,
	...o
});

describe('filterDevices', () => {
	const list = [
		dev({ id: 'a' }),
		dev({
			id: 'b',
			name: 'Beta',
			serial: 'ZZ9',
			siteName: 'Creek',
			siteGroup: 'South',
			statusId: 'bad'
		}),
		dev({ id: 'c', deletedAt: 5 })
	];
	it('drops deleted', () =>
		expect(filterDevices(list, NO_FILTERS).map((d) => d.id)).toEqual(['a', 'b']));
	it('searches name/serial/site', () => {
		expect(filterDevices(list, { ...NO_FILTERS, q: 'zz9' }).map((d) => d.id)).toEqual(['b']);
		expect(filterDevices(list, { ...NO_FILTERS, q: 'ridge' }).map((d) => d.id)).toEqual(['a']);
		expect(filterDevices(list, { ...NO_FILTERS, q: 'beta' }).map((d) => d.id)).toEqual(['b']);
	});
	it('filters by status and group', () => {
		expect(filterDevices(list, { ...NO_FILTERS, statusId: 'bad' }).map((d) => d.id)).toEqual(['b']);
		expect(filterDevices(list, { ...NO_FILTERS, siteGroup: 'North' }).map((d) => d.id)).toEqual([
			'a'
		]);
	});
});

describe('geojson', () => {
	it('builds lon/lat points with icon ids', () => {
		const fc = buildGeoJSON(
			[dev({ id: 'a', deviceTypeId: 'mobile' }), dev({ id: 'd', deletedAt: 1 })],
			new Map([['rec', { id: 'rec', name: 'Rec', color: '#00ff00', icon: 'R' }]]),
			new Map([['mobile', { id: 'mobile', name: 'Mobile' }]])
		);
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].geometry.coordinates).toEqual([20, 10]);
		expect(parseIconId(fc.features[0].properties.icon)).toEqual({
			shape: 'square',
			color: '#00ff00',
			emoji: 'R'
		});
	});
	it('shape fallback is circle', () => {
		expect(shapeFor(undefined)).toBe('circle');
		expect(iconId('circle', '#fff', 'x')).toBe('dev|circle|#fff|x');
	});
});

describe('helpers', () => {
	it('bounds', () => {
		expect(boundsOf([])).toBeNull();
		expect(
			boundsOf([
				{ lat: 1, lon: 2 },
				{ lat: 5, lon: -3 }
			])
		).toEqual([
			[-3, 1],
			[2, 5]
		]);
	});
	it('fitSize', () => {
		expect(fitSize(3200, 1600, 1600)).toEqual({ w: 1600, h: 800 });
		expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
	});
	it('geoUri', () => expect(geoUri(1.5, -2)).toBe('geo:1.500000,-2.000000'));
});

describe('maps hand-off links', async () => {
	const { mapsUrl, detectMapsPlatform } = await import('./geo.ts');
	it('picks the platform', () => {
		expect(detectMapsPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(
			'ios'
		);
		expect(detectMapsPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
		expect(detectMapsPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(
			'desktop'
		);
		expect(detectMapsPlatform('Mozilla/5.0 (Linux; Android 14)', 5)).toBe('android');
	});
	it('builds a link per platform with an escaped label', () => {
		expect(mapsUrl(50.5, 9.25, 'MOB 1', 'ios')).toBe(
			'https://maps.apple.com/?ll=50.500000,9.250000&q=MOB%201'
		);
		expect(mapsUrl(50.5, 9.25, 'MOB 1', 'android')).toBe(
			'geo:50.500000,9.250000?q=50.500000,9.250000(MOB%201)'
		);
		expect(mapsUrl(50.5, 9.25, 'x', 'desktop')).toContain(
			'openstreetmap.org/?mlat=50.500000&mlon=9.250000'
		);
	});
});
