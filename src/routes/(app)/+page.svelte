<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { page } from '$app/state';
	import { app, live } from '#lib/client/app.svelte.ts';
	import type { LocalDevice } from '#lib/client/db.ts';
	import { moveDevice } from '#lib/client/repo.ts';
	import {
		NO_FILTERS,
		boundsOf,
		buildGeoJSON,
		filterDevices,
		formatCoord,
		hasFilters,
		locate,
		type Filters
	} from '#lib/client/geo.ts';
	import {
		ATTRIBUTION,
		EMPTY,
		SRC,
		drawIcon,
		fallbackStyle,
		loadStyle,
		setupDeviceLayers
	} from '#lib/client/map/style.ts';
	import DeviceSheet from '#lib/components/DeviceSheet.svelte';
	import DeviceForm from '#lib/components/DeviceForm.svelte';
	import OfflineAreaDialog from '#lib/components/OfflineAreaDialog.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import type { Bounds } from '#lib/client/offline-tiles.ts';
	import { t } from '#lib/strings.ts';

	const m = t.mapui;

	let el: HTMLDivElement;
	let map: maplibregl.Map | undefined;
	let mapReady = $state(false);
	let offlineOpen = $state(false);
	let addMenu = $state(false);
	const viewBounds = (): Bounds => {
		const b = map!.getBounds();
		return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
	};
	let tilesFailed = $state(false);

	const devices = live(
		() => app.db.devices.filter((d) => !d.deletedAt).toArray(),
		[] as LocalDevice[]
	);
	const types = live(() => app.db.deviceTypes.toArray(), []);
	const cats = live(() => app.db.categories.toArray(), []);
	const statuses = live(() => app.db.statuses.toArray(), []);

	let filters = $state<Filters>({ ...NO_FILTERS });
	let showFilters = $state(false);

	const statusMap = $derived(new Map(statuses.value.map((x) => [x.id, x])));
	const typeMap = $derived(new Map(types.value.map((x) => [x.id, x])));
	const filtered = $derived(filterDevices(devices.value, filters));
	const groups = $derived(
		[...new Set(devices.value.map((d) => d.siteGroup).filter(Boolean))].sort()
	);

	type Mode = 'idle' | 'pick' | 'create' | 'edit' | 'move';
	let mode = $state<Mode>('idle');
	let selectedId = $state('');
	let draft = $state<{ lat: number; lon: number }>({ lat: 0, lon: 0 });
	let accuracy = $state<number | null>(null);
	let notice = $state('');
	let busy = $state(false);

	onMount(() => {
		let disposed = false;
		let ro: ResizeObserver | undefined;
		void (async () => {
			const style = await loadStyle();
			if (disposed) return;
			const usingFallback = Object.keys(style.sources ?? {}).length === 0;
			if (usingFallback) tilesFailed = true;
			const saved = loadView();
			maplibregl.setWorkerUrl(maplibreWorker);
			const mp = new maplibregl.Map({
				container: el,
				style,
				center: saved?.center ?? [9.0, 50.6],
				zoom: saved?.zoom ?? 7,
				attributionControl: false,
				maxPitch: 0,
				maxZoom: MAX_ZOOM,
				dragRotate: false
			});
			map = mp;
			mp.touchZoomRotate.disableRotation();
			if (matchMedia('(pointer: coarse)').matches) mp.doubleClickZoom.disable();
			mp.addControl(
				new maplibregl.AttributionControl({
					customAttribution: usingFallback ? ATTRIBUTION : undefined,
					compact: true
				}),
				'bottom-left'
			);
			mp.on('load', () => (zoom = mp.getZoom()));
			mp.on('zoomend', () => (zoom = mp.getZoom()));
			mp.on('moveend', () => {
				if (viewRestored) saveView(mp);
			});
			viewRestored = !!saved;
			mp.on('styleimagemissing', (e) => {
				if (mp.hasImage(e.id)) return;
				const r = drawIcon(e.id);
				if (r) mp.addImage(e.id, r.image, { pixelRatio: r.pixelRatio });
			});
			mp.on('error', (e) => {
				if (!(e as { sourceId?: string }).sourceId && !mp.getSource(SRC) && !mp.isStyleLoaded()) {
					tilesFailed = true;
					mp.setStyle(fallbackStyle);
				}
			});
			mp.on('style.load', () => {
				setupDeviceLayers(
					mp,
					EMPTY,
					untrack(() => selectedId)
				);
				mapReady = true;
				pushData();
			});
			mp.on('click', onMapClick);
			ro = new ResizeObserver(() => mp.resize());
			ro.observe(el);
		})();
		return () => {
			disposed = true;
			ro?.disconnect();
			clearTimeout(timer);
			marker?.remove();
			ghost?.remove();
			me?.remove();
			map?.remove();
			map = undefined;
		};
	});

	let timer: ReturnType<typeof setTimeout>;
	let latest = {
		f: [] as LocalDevice[],
		s: new Map() as typeof statusMap,
		ty: new Map() as typeof typeMap
	};
	function pushData() {
		const src = map?.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
		src?.setData(buildGeoJSON(latest.f, latest.s, latest.ty));
		if (!viewRestored && latest.f.length && !page.url.searchParams.get('device')) {
			viewRestored = true;
			const b = boundsOf(latest.f);
			if (b && map) map.fitBounds(b, { padding: FIT_PADDING, maxZoom: 14, duration: 0 });
		}
	}

	let viewRestored = false;
	const MAX_ZOOM = 18;
	let zoom = $state(0);
	const FIT_PADDING = { top: 120, right: 84, bottom: 110, left: 30 };
	const VIEW_KEY = 'canopy.mapView';
	function loadView(): { center: [number, number]; zoom: number } | null {
		try {
			const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
			return v && Array.isArray(v.center) && typeof v.zoom === 'number' ? v : null;
		} catch {
			return null;
		}
	}
	function saveView(mp: maplibregl.Map) {
		try {
			const c = mp.getCenter();
			localStorage.setItem(
				VIEW_KEY,
				JSON.stringify({ center: [c.lng, c.lat], zoom: mp.getZoom() })
			);
		} catch {}
	}
	$effect(() => {
		latest = { f: filtered, s: statusMap, ty: typeMap };
		if (!mapReady) return;
		clearTimeout(timer);
		timer = setTimeout(pushData, 150);
	});

	$effect(() => {
		const id = selectedId;
		if (mapReady && map?.getLayer('selected-halo'))
			map.setFilter('selected-halo', ['==', ['get', 'id'], id]);
	});

	function select(id: string, fly = false) {
		selectedId = id;
		mode = 'idle';
		clearGhost();
		if (fly) {
			const d = devices.value.find((x) => x.id === id);
			if (d && map)
				map.flyTo({
					center: [d.lon, d.lat],
					zoom: Math.max(map.getZoom(), 16),
					offset: [0, -el.clientHeight * 0.29]
				});
		}
	}
	function deselect() {
		selectedId = '';
		mode = 'idle';
		removeMarker();
		clearGhost();
	}
	let handledLink = '';
	$effect(() => {
		const link = page.url.searchParams.get('device');
		const ready = mapReady && devices.value.length > 0;
		if (!link || !ready || link === handledLink) return;
		if (!devices.value.some((d) => d.id === link)) return;
		handledLink = link;
		untrack(() => select(link, true));
	});

	let marker: maplibregl.Marker | undefined;
	let ghost: maplibregl.Marker | undefined;
	let me: maplibregl.Marker | undefined;
	function pinEl(cls: string) {
		const e = document.createElement('div');
		e.className = cls;
		return e;
	}
	const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
	function revealAboveSheet(lat: number, lon: number) {
		if (!map) return;
		const sheetPx = el.clientHeight * 0.58;
		const p = map.project([lon, lat]);
		if (p.y < el.clientHeight - sheetPx - 40) return;
		map.easeTo({ center: [lon, lat], offset: [0, -sheetPx / 2], duration: 300 });
	}
	function placeMarker(lat: number, lon: number) {
		lat = r6(lat);
		lon = r6(lon);
		draft = { lat, lon };
		if (!map) return;
		if (!marker) {
			marker = new maplibregl.Marker({ element: pinEl('pin'), draggable: true, anchor: 'bottom' })
				.setLngLat([lon, lat])
				.addTo(map);
			marker.on('drag', () => {
				const p = marker!.getLngLat();
				draft = { lat: r6(p.lat), lon: r6(p.lng) };
			});
		} else marker.setLngLat([lon, lat]);
	}
	function removeMarker() {
		marker?.remove();
		marker = undefined;
	}
	$effect(() => {
		const { lat, lon } = draft;
		if (!marker || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
		const p = marker.getLngLat();
		if (p.lat !== lat || p.lng !== lon) marker.setLngLat([lon, lat]);
	});
	function showGhost(lat: number, lon: number) {
		if (!map) return;
		clearGhost();
		ghost = new maplibregl.Marker({ element: pinEl('pin ghost'), anchor: 'bottom' })
			.setLngLat([lon, lat])
			.addTo(map);
		map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 16) });
	}
	function clearGhost() {
		ghost?.remove();
		ghost = undefined;
	}

	function onMapClick(e: maplibregl.MapMouseEvent) {
		if (!map) return;
		if (mode === 'pick' || mode === 'create' || mode === 'move') {
			placeMarker(e.lngLat.lat, e.lngLat.lng);
			if (mode === 'pick') mode = 'create';
			if (mode === 'create') revealAboveSheet(e.lngLat.lat, e.lngLat.lng);
			return;
		}
		if (mode === 'edit') return;
		const pad = 22;
		const hits = map.queryRenderedFeatures(
			[
				[e.point.x - pad, e.point.y - pad],
				[e.point.x + pad, e.point.y + pad]
			],
			{ layers: ['clusters', 'devices'] }
		);
		const dist = (g: maplibregl.MapGeoJSONFeature) => {
			const [lon, lat] = (g.geometry as { coordinates: number[] }).coordinates;
			const p = map!.project([lon, lat]);
			return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2;
		};
		const f = hits.sort((a, b) => dist(a) - dist(b))[0];
		if (!f) return;
		if (f.properties?.cluster_id !== undefined) {
			const src = map.getSource(SRC) as maplibregl.GeoJSONSource;
			const coords = (f.geometry as { coordinates: number[] }).coordinates as [number, number];
			void src.getClusterExpansionZoom(f.properties.cluster_id).then((z) => {
				map?.easeTo({ center: coords, zoom: z + 0.5 });
			});
		} else if (f.properties?.id) select(String(f.properties.id));
	}

	function fit() {
		const b = boundsOf(filtered);
		if (b && map) map.fitBounds(b, { padding: FIT_PADDING, maxZoom: 16, duration: 600 });
	}
	async function locateMe() {
		notice = m.locating;
		const r = await locate();
		if (!r.ok) {
			notice = m.geo[r.reason];
			return;
		}
		notice = m.accuracy(r.accuracy);
		me?.remove();
		if (map) {
			me = new maplibregl.Marker({ element: pinEl('me') }).setLngLat([r.lon, r.lat]).addTo(map);
			map.flyTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 16) });
		}
	}
	async function addHere() {
		notice = m.locating;
		busy = true;
		const r = await locate();
		busy = false;
		if (!r.ok) {
			notice = m.geo[r.reason];
			return;
		}
		notice = '';
		accuracy = r.accuracy;
		selectedId = '';
		placeMarker(r.lat, r.lon);
		map?.flyTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 17) });
		mode = 'create';
	}
	function addByTap() {
		notice = '';
		accuracy = null;
		selectedId = '';
		removeMarker();
		mode = 'pick';
	}
	function startMove() {
		const d = devices.value.find((x) => x.id === selectedId);
		if (!d) return;
		placeMarker(d.lat, d.lon);
		mode = 'move';
	}
	function cancelMode() {
		removeMarker();
		accuracy = null;
		mode = 'idle';
	}
	async function savePosition() {
		if (!selectedId) return;
		busy = true;
		try {
			await moveDevice(app.ctx(), selectedId, draft.lat, draft.lon);
			removeMarker();
			mode = 'idle';
		} finally {
			busy = false;
		}
	}
	function saved(d: LocalDevice) {
		removeMarker();
		accuracy = null;
		select(d.id, mode === 'create');
	}

	const sheetOpen = $derived(
		mode === 'create' || mode === 'edit' || (mode === 'idle' && !!selectedId)
	);
</script>

<div class="mappage">
	<div class="map" bind:this={el}></div>

	<div class="top">
		<div class="searchrow">
			<label class="search">
				<Icon name="search" size={20} />
				<input type="search" placeholder={m.search} aria-label={m.search} bind:value={filters.q} />
			</label>
			<button
				class="btn filterbtn"
				class:active={hasFilters({ ...filters, q: '' })}
				aria-expanded={showFilters}
				aria-label={m.filters}
				onclick={() => (showFilters = !showFilters)}
			>
				<Icon name="filter" size={20} /><span class="fl">{m.filters}</span>
				{#if hasFilters({ ...filters, q: '' })}<span class="dot" aria-hidden="true"></span>{/if}
			</button>
		</div>
		{#if showFilters}
			<div class="filters">
				<select aria-label={t.device.category} bind:value={filters.categoryId}>
					<option value="">{m.allCategories}</option>
					{#each cats.value.filter((c) => !c.deletedAt) as c (c.id)}
						<option value={c.id}>{c.icon} {c.name}</option>
					{/each}
				</select>
				<select aria-label={t.device.status} bind:value={filters.statusId}>
					<option value="">{m.allStatuses}</option>
					{#each statuses.value
						.filter((x) => !x.deletedAt)
						.sort((a, b) => a.sortOrder - b.sortOrder) as x (x.id)}
						<option value={x.id}>{x.icon} {x.name}</option>
					{/each}
				</select>
				<select aria-label={t.device.siteGroup} bind:value={filters.siteGroup}>
					<option value="">{m.allGroups}</option>
					{#each groups as g (g)}<option value={g}>{g}</option>{/each}
				</select>
				<button class="btn ghost" onclick={() => (filters = { ...NO_FILTERS })}>{m.clear}</button>
			</div>
		{/if}
		<div class="info" aria-live="polite">
			<span class="num">{m.count(filtered.length, devices.value.length)}</span>
			{#if tilesFailed}<span class="warn">{m.mapFallback}</span>{/if}
			{#if notice}<strong>{notice}</strong>{/if}
		</div>
	</div>

	{#if mode === 'pick' || mode === 'move'}
		<div class="banner" role="status">
			<span class="bt"
				><Icon name={mode === 'pick' ? 'tap' : 'move'} size={22} />{mode === 'pick'
					? m.pickHint
					: m.moveHint}</span
			>
			{#if mode === 'move'}
				<span class="mono">{formatCoord(draft.lat)}, {formatCoord(draft.lon)}</span>
				<button class="btn primary" disabled={busy} onclick={savePosition}>{m.savePosition}</button>
			{/if}
			<button class="btn" onclick={cancelMode}>{m.cancel}</button>
		</div>
	{/if}

	{#if mode === 'idle' && !selectedId}
		<div class="ctrls" role="toolbar" aria-label={m.mapControls} hidden={addMenu}>
			<div class="group">
				<button
					class="ctl"
					disabled={zoom >= MAX_ZOOM - 0.01}
					aria-label={m.zoomIn}
					title={m.zoomIn}
					onclick={() => map?.zoomIn()}
				>
					<Icon name="plus" size={24} />
				</button>
				<button class="ctl" aria-label={m.zoomOut} title={m.zoomOut} onclick={() => map?.zoomOut()}>
					<Icon name="minus" size={24} />
				</button>
			</div>
			<button class="ctl solo" aria-label={m.locate} title={m.locate} onclick={locateMe}>
				<Icon name="locate" size={24} />
			</button>
			<button class="ctl solo" aria-label={m.fit} title={m.fit} onclick={fit}>
				<Icon name="fit" size={24} />
			</button>
			<button
				class="ctl solo"
				aria-label={t.offline.title}
				title={t.offline.title}
				onclick={() => (offlineOpen = true)}
			>
				<Icon name="download" size={24} />
			</button>
		</div>
		<div class="add">
			{#if addMenu}
				<div class="add-menu">
					<button class="btn" disabled={busy} onclick={() => ((addMenu = false), addHere())}>
						<Icon name="pin" />{m.addHere}
					</button>
					<button class="btn" onclick={() => ((addMenu = false), addByTap())}>
						<Icon name="tap" />{m.addTap}
					</button>
				</div>
			{/if}
			<button class="btn primary fab" aria-expanded={addMenu} onclick={() => (addMenu = !addMenu)}>
				<Icon name={addMenu ? 'close' : 'plus'} size={24} stroke={2.5} /><span>{m.add}</span>
			</button>
		</div>
	{/if}

	{#if offlineOpen}
		<OfflineAreaDialog getBounds={viewBounds} onClose={() => (offlineOpen = false)} />
	{/if}

	{#if sheetOpen}
		<div class="bsheet">
			<div class="grab" aria-hidden="true"></div>
			{#if mode === 'create'}
				<DeviceForm
					bind:lat={draft.lat}
					bind:lon={draft.lon}
					{accuracy}
					onsaved={saved}
					oncancel={cancelMode}
				/>
			{:else if mode === 'edit'}
				{#key selectedId}
					{@const dev = devices.value.find((x) => x.id === selectedId)}
					{#if dev}
						<DeviceForm device={dev} onsaved={saved} oncancel={() => (mode = 'idle')} />
					{/if}
				{/key}
			{:else}
				{#key selectedId}
					<DeviceSheet
						id={selectedId}
						onclose={deselect}
						onedit={() => (mode = 'edit')}
						onmove={startMove}
						onshowpos={showGhost}
						ondeleted={deselect}
					/>
				{/key}
			{/if}
		</div>
	{/if}
</div>

<style>
	.mappage {
		position: relative;
		height: 100%;
		overflow: hidden;
	}
	.map {
		position: absolute;
		inset: 0;
	}

	.top {
		position: absolute;
		top: 10px;
		left: 10px;
		right: 10px;
		z-index: 5;
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.searchrow {
		display: flex;
		gap: 8px;
	}
	.search {
		position: relative;
		flex: 1;
		min-width: 0;
		margin: 0;
		display: flex;
		align-items: center;
		color: var(--muted);
	}
	.search :global(.icon) {
		position: absolute;
		left: 14px;
		pointer-events: none;
	}
	.search input {
		margin: 0;
		padding-left: 44px;
		border-color: var(--line);
		border-radius: 999px;
		box-shadow: var(--shadow);
	}
	.filterbtn {
		position: relative;
		border-radius: 999px;
		box-shadow: var(--shadow);
	}
	.filterbtn.active {
		color: var(--primary);
		border-color: var(--primary);
	}
	.filterbtn .dot {
		position: absolute;
		top: 9px;
		right: 11px;
		width: 9px;
		height: 9px;
		background: var(--primary);
		border-radius: 50%;
	}
	@media (max-width: 420px) {
		.filterbtn {
			width: var(--tap);
			padding: 0;
		}
		.fl {
			display: none;
		}
	}
	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 8px;
		margin-top: 8px;
		padding: 10px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.filters select {
		margin: 0;
	}
	.info {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		max-width: 100%;
		margin-top: 8px;
		padding: 5px 12px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--fg);
		background: rgb(255 255 255 / 0.94);
		border-radius: 999px;
		box-shadow: var(--shadow-sm);
	}
	.info .warn {
		color: #8a4b05;
	}

	.banner {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 12px;
		z-index: 6;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		font-weight: 650;
		background: var(--bg);
		border: 1px solid var(--line);
		border-left: 5px solid var(--focus);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
	}
	.bt {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1 1 200px;
	}
	.mono {
		font-size: 0.9rem;
	}

	.ctrls {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 5;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
	}
	.group {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 16px;
		box-shadow: var(--shadow);
	}
	.group .ctl + .ctl {
		border-top: 1px solid var(--line);
	}
	.ctl {
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		padding: 0;
		color: var(--fg);
		background: var(--bg);
		border: 0;
		cursor: pointer;
	}
	.ctl:active {
		background: var(--surface);
	}
	.ctl:disabled {
		color: #b9c2bc;
		cursor: default;
	}
	.ctl.solo {
		border: 1px solid var(--line);
		border-radius: 16px;
		box-shadow: var(--shadow);
	}
	.add {
		position: absolute;
		right: 10px;
		bottom: 16px;
		z-index: 6;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
	}
	.add-menu {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}
	.add-menu .btn {
		justify-content: flex-start;
		min-height: 58px;
		padding: 0 20px 0 16px;
		box-shadow: var(--shadow-lg);
	}
	.add-menu .btn :global(.icon) {
		color: var(--primary);
	}
	.fab {
		min-height: 60px;
		padding: 0 24px 0 20px;
		font-size: 1.05rem;
		border-radius: 999px;
		box-shadow: var(--shadow-lg);
	}
	@media (max-height: 560px) {
		.ctrls {
			top: 74px;
			transform: none;
			flex-direction: row;
			flex-wrap: wrap;
			justify-content: flex-end;
			max-width: 70%;
		}
		.group {
			flex-direction: row;
		}
		.group .ctl + .ctl {
			border-top: 0;
			border-left: 1px solid var(--line);
		}
	}

	.bsheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		max-height: 62%;
		overflow: auto;
		overscroll-behavior: contain;
		background: var(--bg);
		border-radius: 22px 22px 0 0;
		box-shadow: 0 -6px 30px rgb(16 28 22 / 0.22);
	}
	@media (min-width: 900px) {
		.top {
			right: auto;
			width: min(520px, calc(100% - 460px));
		}
		.bsheet {
			left: auto;
			top: 10px;
			right: 10px;
			bottom: 10px;
			width: 420px;
			max-height: none;
			border-radius: var(--radius);
		}
		.grab {
			display: none;
		}
	}
	.grab {
		position: sticky;
		top: 0;
		z-index: 2;
		height: 18px;
		background: var(--bg);
	}
	.grab::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 8px;
		width: 40px;
		height: 5px;
		margin-left: -20px;
		background: var(--line);
		border-radius: 3px;
	}
	:global(.bsheet form) {
		padding: 0 16px 12px;
	}
	:global(.pin) {
		width: 36px;
		height: 36px;
		background: var(--focus);
		border: 4px solid #fff;
		border-radius: 50% 50% 50% 0;
		transform: rotate(-45deg);
		box-shadow: 0 3px 8px rgb(0 0 0 / 0.45);
		cursor: grab;
	}
	:global(.pin.ghost) {
		background: #6b7570;
		cursor: default;
	}
	:global(.me) {
		width: 22px;
		height: 22px;
		background: #1565c0;
		border: 4px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 2px #1565c0;
	}
	:global(.maplibregl-ctrl-attrib) {
		font-size: 11px;
	}
</style>
