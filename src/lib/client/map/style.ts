import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { loadMapStyle } from '../map-style.ts';
import { parseIconId, type DeviceCollection } from '../geo.ts';

export const STYLE_URL = '/map/style.json';
export const ATTRIBUTION = '© OpenStreetMap contributors';
export const SRC = 'devices';
export const GLYPHS = '/fonts/{fontstack}/{range}.pbf';
const FONT = ['Noto Sans Regular'];

export const fallbackStyle: StyleSpecification = {
	version: 8,
	glyphs: GLYPHS,
	sources: {},
	layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ecdf' } }]
};

export async function loadStyle(): Promise<StyleSpecification> {
	try {
		const s = (await loadMapStyle()) as unknown as StyleSpecification;
		if (!s || !Array.isArray(s.layers)) throw new Error('bad style');
		return s;
	} catch {
		return { ...fallbackStyle, glyphs: location.origin + GLYPHS };
	}
}

const PX = 2;
const SIZE = 36;

export function drawIcon(id: string): { image: ImageData; pixelRatio: number } | null {
	const p = parseIconId(id);
	if (!p) return null;
	const s = SIZE * PX;
	const c = document.createElement('canvas');
	c.width = c.height = s;
	const g = c.getContext('2d');
	if (!g) return null;
	const m = 3 * PX;
	g.beginPath();
	if (p.shape === 'square') g.roundRect(m, m, s - 2 * m, s - 2 * m, 7 * PX);
	else g.arc(s / 2, s / 2, s / 2 - m, 0, Math.PI * 2);
	g.fillStyle = p.color;
	g.fill();
	g.lineWidth = 2.5 * PX;
	g.strokeStyle = '#ffffff';
	g.stroke();
	g.lineWidth = 1 * PX;
	g.strokeStyle = '#111111';
	g.beginPath();
	if (p.shape === 'square')
		g.roundRect(m - PX, m - PX, s - 2 * m + 2 * PX, s - 2 * m + 2 * PX, 8 * PX);
	else g.arc(s / 2, s / 2, s / 2 - m + 1.5 * PX, 0, Math.PI * 2);
	g.stroke();
	g.font = `${13 * PX}px system-ui, "Noto Color Emoji", sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillStyle = '#fff';
	g.fillText(p.emoji, s / 2, s / 2 + PX);
	return { image: g.getImageData(0, 0, s, s), pixelRatio: PX };
}

export const EMPTY: DeviceCollection = { type: 'FeatureCollection', features: [] };

export function setupDeviceLayers(map: MlMap, data: DeviceCollection, selectedId: string) {
	if (!map.getSource(SRC))
		map.addSource(SRC, {
			type: 'geojson',
			data,
			cluster: true,
			clusterRadius: 48,
			clusterMaxZoom: 15,
			promoteId: 'id'
		});
	if (map.getLayer('clusters')) return;
	map.addLayer({
		id: 'clusters',
		type: 'circle',
		source: SRC,
		filter: ['has', 'point_count'],
		paint: {
			'circle-color': '#263238',
			'circle-radius': ['step', ['get', 'point_count'], 20, 25, 26, 150, 32],
			'circle-stroke-width': 3,
			'circle-stroke-color': '#ffffff'
		}
	});
	map.addLayer({
		id: 'cluster-count',
		type: 'symbol',
		source: SRC,
		filter: ['has', 'point_count'],
		layout: {
			'text-field': ['get', 'point_count_abbreviated'],
			'text-font': FONT,
			'text-size': 16,
			'text-allow-overlap': true
		},
		paint: { 'text-color': '#ffffff' }
	});
	map.addLayer({
		id: 'selected-halo',
		type: 'circle',
		source: SRC,
		filter: ['==', ['get', 'id'], selectedId],
		paint: {
			'circle-radius': 24,
			'circle-color': 'rgba(255,111,0,0.25)',
			'circle-stroke-color': '#ff6f00',
			'circle-stroke-width': 3
		}
	});
	map.addLayer({
		id: 'devices',
		type: 'symbol',
		source: SRC,
		filter: ['!', ['has', 'point_count']],
		layout: {
			'icon-image': ['get', 'icon'],
			'icon-allow-overlap': true,
			'icon-ignore-placement': true
		}
	});
}
