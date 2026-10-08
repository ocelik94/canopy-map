import type { LocalDevice } from './db.ts';

export interface RefLite {
	id: string;
	name: string;
	color: string;
	icon: string;
}
export interface Filters {
	q: string;
	categoryId: string;
	statusId: string;
	siteGroup: string;
}
export const NO_FILTERS: Filters = { q: '', categoryId: '', statusId: '', siteGroup: '' };

export const hasFilters = (f: Filters) =>
	!!(f.q.trim() || f.categoryId || f.statusId || f.siteGroup);

export function filterDevices(devices: LocalDevice[], f: Filters): LocalDevice[] {
	const q = f.q.trim().toLowerCase();
	return devices.filter((d) => {
		if (d.deletedAt) return false;
		if (f.categoryId && d.categoryId !== f.categoryId) return false;
		if (f.statusId && d.statusId !== f.statusId) return false;
		if (f.siteGroup && d.siteGroup !== f.siteGroup) return false;
		if (q) {
			const hay = `${d.name}\n${d.serial}\n${d.siteName}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
}

export type Shape = 'circle' | 'square';
export function shapeFor(type?: { id: string; name: string } | null): Shape {
	return type && /mobile|portable|roam|drift|vehicle/i.test(`${type.id} ${type.name}`)
		? 'square'
		: 'circle';
}
export const isMobileType = (type?: { id: string; name: string } | null) =>
	shapeFor(type) === 'square';

export const iconId = (shape: Shape, color: string, emoji: string) =>
	`dev|${shape}|${color}|${emoji}`;
export function parseIconId(id: string): { shape: Shape; color: string; emoji: string } | null {
	const p = id.split('|');
	if (p.length < 4 || p[0] !== 'dev') return null;
	return {
		shape: p[1] === 'square' ? 'square' : 'circle',
		color: p[2],
		emoji: p.slice(3).join('|')
	};
}

export interface DeviceFeature {
	type: 'Feature';
	geometry: { type: 'Point'; coordinates: [number, number] };
	properties: { id: string; name: string; icon: string };
}
export interface DeviceCollection {
	type: 'FeatureCollection';
	features: DeviceFeature[];
}

export function buildGeoJSON(
	devices: LocalDevice[],
	statuses: Map<string, RefLite>,
	types: Map<string, { id: string; name: string }>
): DeviceCollection {
	const features: DeviceFeature[] = [];
	for (const d of devices) {
		if (d.deletedAt) continue;
		const st = statuses.get(d.statusId);
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
			properties: {
				id: d.id,
				name: d.name,
				icon: iconId(shapeFor(types.get(d.deviceTypeId)), st?.color ?? '#555555', st?.icon ?? '•')
			}
		});
	}
	return { type: 'FeatureCollection', features };
}

export function boundsOf(
	points: { lat: number; lon: number }[]
): [[number, number], [number, number]] | null {
	if (!points.length) return null;
	let w = 180,
		s = 90,
		e = -180,
		n = -90;
	for (const p of points) {
		if (p.lon < w) w = p.lon;
		if (p.lon > e) e = p.lon;
		if (p.lat < s) s = p.lat;
		if (p.lat > n) n = p.lat;
	}
	return [
		[w, s],
		[e, n]
	];
}

export const geoUri = (lat: number, lon: number) => `geo:${lat.toFixed(6)},${lon.toFixed(6)}`;

export type MapsPlatform = 'ios' | 'android' | 'desktop';

export function detectMapsPlatform(
	ua = navigator.userAgent,
	touchPoints = navigator.maxTouchPoints ?? 0
): MapsPlatform {
	if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
	if (/Android/.test(ua)) return 'android';
	return 'desktop';
}

export function mapsUrl(
	lat: number,
	lon: number,
	label: string,
	platform: MapsPlatform = detectMapsPlatform()
): string {
	const la = lat.toFixed(6);
	const lo = lon.toFixed(6);
	const q = encodeURIComponent(label);
	switch (platform) {
		case 'ios':
			return `https://maps.apple.com/?ll=${la},${lo}&q=${q}`;
		case 'android':
			return `geo:${la},${lo}?q=${la},${lo}(${q})`;
		default:
			return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`;
	}
}
export const formatCoord = (v: number) => v.toFixed(6);

export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
	const k = Math.min(1, max / Math.max(w, h));
	return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export const todayIso = () => {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export type GeoResult =
	| { ok: true; lat: number; lon: number; accuracy: number }
	| { ok: false; reason: 'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout' };

export function locate(timeoutMs = 20000): Promise<GeoResult> {
	if (typeof navigator === 'undefined' || !navigator.geolocation)
		return Promise.resolve({ ok: false, reason: 'unsupported' });
	if (typeof isSecureContext !== 'undefined' && !isSecureContext)
		return Promise.resolve({ ok: false, reason: 'insecure' });
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(p) =>
				resolve({
					ok: true,
					lat: p.coords.latitude,
					lon: p.coords.longitude,
					accuracy: p.coords.accuracy
				}),
			(e) =>
				resolve({
					ok: false,
					reason: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'
				}),
			{ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 5000 }
		);
	});
}

export async function resizeImage(file: Blob, max = 1600, quality = 0.82): Promise<Blob> {
	const bmp = await createImageBitmap(file);
	const { w, h } = fitSize(bmp.width, bmp.height, max);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
	bmp.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('encode failed'))),
			'image/jpeg',
			quality
		)
	);
}
