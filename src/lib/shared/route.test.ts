import { describe, it, expect } from 'vitest';
import {
	appleDirections,
	googleDirections,
	googleRouteLegs,
	orderStops,
	stopsFromDevices
} from './route.ts';

const dev = (name: string, siteName: string, lat: number, lon: number) => ({
	name,
	siteName,
	lat,
	lon
});

describe('navigation hand-off', () => {
	it('builds single-target directions links', () => {
		expect(googleDirections(50.5, 9.25)).toBe(
			'https://www.google.com/maps/dir/?api=1&destination=50.500000,9.250000'
		);
		expect(appleDirections(50.5, 9.25, 'MOB 1')).toBe(
			'https://maps.apple.com/?daddr=50.500000,9.250000&q=MOB%201'
		);
	});

	it('groups devices by site with the centroid as stop', () => {
		const stops = stopsFromDevices([
			dev('a', 'Taufstein', 50.5, 9.2),
			dev('b', 'Taufstein', 50.6, 9.4),
			dev('c', '', 51, 9)
		]);
		expect(stops).toHaveLength(2);
		expect(stops[0]).toMatchObject({ name: 'Taufstein', count: 2 });
		expect(stops[0].lat).toBeCloseTo(50.55);
		expect(stops[1].name).toBe('c');
	});

	it('orders stops nearest-first from the start position', () => {
		const stops = stopsFromDevices([
			dev('far', 'Far', 51.5, 9.5),
			dev('near', 'Near', 50.1, 8.7),
			dev('mid', 'Mid', 50.5, 9.2)
		]);
		expect(orderStops(stops, { lat: 50.11, lon: 8.68 }).map((s) => s.name)).toEqual([
			'Near',
			'Mid',
			'Far'
		]);
	});

	it('splits a long trip into legs; later legs start where the previous ended', () => {
		const stops = Array.from({ length: 6 }, (_, i) => ({
			name: `S${i + 1}`,
			lat: 50 + i / 10,
			lon: 9,
			count: 1
		}));
		const legs = googleRouteLegs(stops, 4);
		expect(legs.map((l) => [l.from, l.to])).toEqual([
			[1, 4],
			[5, 6]
		]);
		const first = new URL(legs[0].url).searchParams;
		expect(first.get('origin')).toBeNull();
		expect(first.get('destination')).toBe('50.300000,9.000000');
		expect(first.get('waypoints')).toBe('50.000000,9.000000|50.100000,9.000000|50.200000,9.000000');
		const second = new URL(legs[1].url).searchParams;
		expect(second.get('origin')).toBe('50.300000,9.000000');
		expect(second.get('destination')).toBe('50.500000,9.000000');
	});
});
