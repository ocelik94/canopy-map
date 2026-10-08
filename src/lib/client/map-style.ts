import { tileVersion } from './offline-tiles.ts';
export interface StyleLike {
	glyphs?: string;
	sprite?: string;
	sources?: Record<string, { tiles?: string[]; url?: string; [k: string]: unknown }>;
	[k: string]: unknown;
}

const abs = (u: string, origin: string) => (u.startsWith('/') ? origin + u : u);

export function absolutizeStyle<T extends StyleLike>(style: T, origin: string): T {
	const out = structuredClone(style);
	if (out.glyphs) out.glyphs = abs(out.glyphs, origin);
	if (out.sprite) out.sprite = abs(out.sprite, origin);
	for (const s of Object.values(out.sources ?? {})) {
		if (s.tiles) s.tiles = s.tiles.map((t) => abs(t, origin));
		if (s.url) s.url = abs(s.url, origin);
	}
	return out;
}

export async function loadMapStyle(origin = location.origin): Promise<StyleLike> {
	const [res, version] = await Promise.all([fetch('/map/style.json'), tileVersion()]);
	if (!res.ok) throw new Error(`style.json: HTTP ${res.status}`);
	return withTileVersion(absolutizeStyle((await res.json()) as StyleLike, origin), version);
}

export function withTileVersion<T extends StyleLike>(style: T, version: string): T {
	if (!version) return style;
	const out = structuredClone(style);
	for (const s of Object.values(out.sources ?? {})) {
		if (s.tiles)
			s.tiles = s.tiles.map(
				(t) => `${t}${t.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
			);
	}
	return out;
}
