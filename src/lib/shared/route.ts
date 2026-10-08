export interface Stop {
	name: string;
	lat: number;
	lon: number;
	count: number;
}

const fmt = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

export const googleDirections = (lat: number, lon: number) =>
	`https://www.google.com/maps/dir/?api=1&destination=${fmt(lat, lon)}`;

export const appleDirections = (lat: number, lon: number, label: string) =>
	`https://maps.apple.com/?daddr=${fmt(lat, lon)}&q=${encodeURIComponent(label)}`;

export function stopsFromDevices(
	devices: { name: string; siteName: string; lat: number; lon: number }[]
): Stop[] {
	const bySite = new Map<string, { name: string; lat: number; lon: number; count: number }>();
	for (const d of devices) {
		const key = d.siteName.trim() || `#${d.name}`;
		const s = bySite.get(key);
		if (s) {
			s.lat += d.lat;
			s.lon += d.lon;
			s.count++;
		} else bySite.set(key, { name: d.siteName.trim() || d.name, lat: d.lat, lon: d.lon, count: 1 });
	}
	return [...bySite.values()].map((s) => ({ ...s, lat: s.lat / s.count, lon: s.lon / s.count }));
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
	const x = (((b.lon - a.lon) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
	const y = ((b.lat - a.lat) * Math.PI) / 180;
	return Math.sqrt(x * x + y * y) * 6371;
}

export function orderStops(stops: Stop[], start?: { lat: number; lon: number } | null): Stop[] {
	const left = [...stops];
	const out: Stop[] = [];
	let here: { lat: number; lon: number } = start ?? left[0];
	while (left.length) {
		let best = 0;
		for (let i = 1; i < left.length; i++)
			if (distanceKm(here, left[i]) < distanceKm(here, left[best])) best = i;
		const next = left.splice(best, 1)[0];
		out.push(next);
		here = next;
	}
	return out;
}

export const STOPS_PER_LEG = 4;

export interface Leg {
	from: number;
	to: number;
	stops: Stop[];
	url: string;
}

export function googleRouteLegs(ordered: Stop[], perLeg = STOPS_PER_LEG): Leg[] {
	const legs: Leg[] = [];
	for (let i = 0; i < ordered.length; i += perLeg) {
		const stops = ordered.slice(i, i + perLeg);
		const dest = stops[stops.length - 1];
		const via = stops.slice(0, -1);
		const p = new URLSearchParams({
			api: '1',
			destination: fmt(dest.lat, dest.lon),
			travelmode: 'driving'
		});
		if (i > 0) {
			const prev = ordered[i - 1];
			p.set('origin', fmt(prev.lat, prev.lon));
		}
		if (via.length) p.set('waypoints', via.map((s) => fmt(s.lat, s.lon)).join('|'));
		legs.push({
			from: i + 1,
			to: i + stops.length,
			stops,
			url: `https://www.google.com/maps/dir/?${p}`
		});
	}
	return legs;
}
