<script lang="ts">
	import { onMount } from 'svelte';
	import { t, fmtDate } from '#lib/strings.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { app, live } from '#lib/client/app.svelte.ts';
	import {
		AreaTooLargeError,
		MAX_AREA_TILES,
		deleteArea,
		downloadArea,
		estimateTiles,
		formatBytes,
		type Bounds,
		type Progress
	} from '#lib/client/offline-tiles.ts';

	let { getBounds, onClose }: { getBounds: () => Bounds; onClose: () => void } = $props();

	let dialog: HTMLDialogElement;
	let bounds = $state<Bounds>([0, 0, 0, 0]);
	let archiveMin = $state(0);
	let archiveMax = $state(14);
	let installed = $state<boolean | null>(null);
	let minZoom = $state(8);
	let maxZoom = $state(14);
	let name = $state('');
	let progress = $state<Progress | null>(null);
	let message = $state('');
	let messageIsError = $state(false);
	let controller: AbortController | null = null;
	let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

	const areas = live(() => app.db.tileAreas.orderBy('downloadedAt').reverse().toArray(), []);
	const est = $derived(estimateTiles(bounds, minZoom, maxZoom));
	const busy = $derived(progress !== null);
	const zooms = $derived(
		Array.from({ length: archiveMax - archiveMin + 1 }, (_, i) => archiveMin + i)
	);

	onMount(() => {
		bounds = getBounds();
		dialog.showModal();
		const upd = () => (online = navigator.onLine);
		window.addEventListener('online', upd);
		window.addEventListener('offline', upd);
		void fetch('/tiles/info.json')
			.then((r) => r.json())
			.then((i) => {
				installed = !!i.installed;
				if (i.installed) {
					archiveMin = i.minzoom ?? 0;
					archiveMax = i.maxzoom ?? 14;
					maxZoom = Math.min(archiveMax, 14);
					minZoom = Math.max(archiveMin, Math.min(8, maxZoom));
				}
			})
			.catch(() => (installed = null));
		return () => {
			window.removeEventListener('online', upd);
			window.removeEventListener('offline', upd);
			controller?.abort();
		};
	});

	function setMin(v: number) {
		minZoom = v;
		if (maxZoom < v) maxZoom = v;
	}
	function setMax(v: number) {
		maxZoom = v;
		if (minZoom > v) minZoom = v;
	}

	async function start() {
		message = '';
		controller = new AbortController();
		progress = { done: 0, total: est.tiles, failed: 0 };
		try {
			await downloadArea(
				{ bounds, minZoom, maxZoom, name: name.trim() || t.offline.defaultName },
				app.db,
				(p) => (progress = p),
				controller.signal
			);
			message = t.offline.done;
			messageIsError = false;
			name = '';
		} catch (e) {
			if (controller.signal.aborted) {
				message = t.offline.cancelled;
				messageIsError = false;
			} else {
				message =
					e instanceof AreaTooLargeError ? t.offline.tooMany(MAX_AREA_TILES) : t.offline.failed;
				messageIsError = true;
			}
		} finally {
			progress = null;
			controller = null;
		}
	}

	async function remove(id: string, n: string) {
		if (confirm(t.offline.confirmDelete(n))) await deleteArea(app.db, id);
	}

	function close() {
		controller?.abort();
		dialog.close();
	}
	const fmt = (b: Bounds) =>
		`${b[1].toFixed(4)}, ${b[0].toFixed(4)} → ${b[3].toFixed(4)}, ${b[2].toFixed(4)}`;
</script>

<dialog bind:this={dialog} onclose={onClose} aria-labelledby="offline-title">
	<header class="head">
		<h2 id="offline-title">{t.offline.title}</h2>
		<button class="btn ghost iconbtn" type="button" aria-label={t.offline.close} onclick={close}>
			<Icon name="close" size={22} />
		</button>
	</header>

	<div class="body">
		<p class="intro">{t.offline.intro}</p>

		{#if installed === false}
			<p class="notice err">{t.offline.noTiles}</p>
		{:else}
			<div class="view">
				<div class="view-text">
					<span class="eyebrow">{t.offline.currentView}</span>
					<code class="mono">{fmt(bounds)}</code>
				</div>
				<button
					class="btn iconbtn"
					type="button"
					disabled={busy}
					aria-label={t.offline.refresh}
					title={t.offline.refresh}
					onclick={() => (bounds = getBounds())}
				>
					<Icon name="sync" size={20} />
				</button>
			</div>

			<fieldset disabled={busy}>
				<legend class="eyebrow">{t.offline.zoomRange}</legend>
				<div class="pair">
					<label>
						{t.offline.minZoom}
						<select value={minZoom} onchange={(e) => setMin(Number(e.currentTarget.value))}>
							{#each zooms as z (z)}<option value={z}>{z}</option>{/each}
						</select>
					</label>
					<label>
						{t.offline.maxZoom}
						<select value={maxZoom} onchange={(e) => setMax(Number(e.currentTarget.value))}>
							{#each zooms as z (z)}<option value={z}>{z}</option>{/each}
						</select>
					</label>
				</div>
				<label>
					{t.offline.name}
					<input bind:value={name} placeholder={t.offline.namePlaceholder} maxlength="60" />
				</label>
			</fieldset>

			<p class="estimate num" class:notice={est.tooMany} class:err={est.tooMany}>
				{est.tooMany
					? t.offline.tooMany(MAX_AREA_TILES)
					: t.offline.estimate(est.tiles, formatBytes(est.bytes))}
			</p>

			{#if progress}
				<div class="progress">
					<progress max={progress.total} value={progress.done}></progress>
					<p class="num" aria-live="polite">{t.offline.progress(progress.done, progress.total)}</p>
				</div>
			{/if}
			{#if message}<p
					class="notice"
					class:ok={!messageIsError}
					class:err={messageIsError}
					role="status"
				>
					{message}
				</p>{/if}
			{#if !online}<p class="notice err">{t.offline.offlineNow}</p>{/if}
		{/if}

		<div class="actions">
			{#if busy}
				<button class="btn danger" type="button" onclick={() => controller?.abort()}
					>{t.offline.cancel}</button
				>
			{:else if installed !== false}
				<button class="btn primary" type="button" disabled={est.tooMany || !online} onclick={start}>
					<Icon name="download" size={20} />
					{t.offline.download}
				</button>
			{/if}
			<button class="btn" type="button" onclick={close}>{t.offline.close}</button>
		</div>
	</div>

	<section class="saved">
		<h3>{t.offline.saved}</h3>
		{#if areas.value.length === 0}
			<p class="muted">{t.offline.none}</p>
		{:else}
			<ul class="areas">
				{#each areas.value as a (a.id)}
					<li>
						<span class="glyph"><Icon name="map" size={20} /></span>
						<div class="area-text">
							<span class="area-name">{a.name}</span>
							<span class="area-sub num">
								{t.offline.areaSummary(a.minZoom, a.maxZoom, a.tiles, fmtDate(a.downloadedAt))}
							</span>
						</div>
						<button
							class="btn ghost del"
							type="button"
							disabled={busy}
							onclick={() => remove(a.id, a.name)}
						>
							{t.offline.delete}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</dialog>

<style>
	dialog {
		width: min(34rem, calc(100vw - 24px));
		max-height: calc(100dvh - 24px);
		padding: 0;
		color: var(--fg);
		background: var(--bg);
		border: 0;
		border-radius: 16px;
		box-shadow: var(--shadow-lg);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	dialog::backdrop {
		background: rgb(16 28 22 / 0.45);
	}
	.head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 8px 10px 20px;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.head h2 {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: 1.15rem;
	}
	.iconbtn {
		flex: none;
		width: var(--tap);
		padding: 0;
	}
	.body {
		padding: 16px 20px 4px;
	}
	.intro {
		margin: 0 0 16px;
		color: var(--muted);
	}
	.view {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px 10px 14px;
		background: var(--surface);
		border-radius: var(--radius-sm);
	}
	.view-text {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.view code {
		overflow-wrap: anywhere;
	}
	.view .iconbtn {
		background: var(--bg);
	}
	fieldset {
		min-width: 0;
		margin: 18px 0 0;
		padding: 0;
		border: 0;
	}
	legend {
		padding: 0;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.pair label {
		margin-bottom: 0;
	}
	.estimate {
		margin: 4px 0 0;
		font-size: 0.95rem;
		color: var(--muted);
	}
	.estimate.err {
		color: var(--danger);
	}
	.progress {
		margin-top: 14px;
	}
	.progress p {
		margin: 6px 0 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
	progress {
		display: block;
		width: 100%;
		height: 10px;
		appearance: none;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		overflow: hidden;
		accent-color: var(--primary);
	}
	progress::-webkit-progress-bar {
		background: var(--surface);
		border-radius: 999px;
	}
	progress::-webkit-progress-value {
		background: var(--primary);
		border-radius: 999px;
		transition: width 0.2s;
	}
	progress::-moz-progress-bar {
		background: var(--primary);
		border-radius: 999px;
	}
	.notice {
		margin: 14px 0 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin: 18px 0 16px;
	}
	.actions .btn {
		flex: 1 1 auto;
	}
	.saved {
		padding: 4px 20px 20px;
		border-top: 1px solid var(--line);
	}
	.saved h3 {
		margin: 14px 0 8px;
	}
	.saved p {
		margin: 0;
	}
	.areas {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
	}
	.areas li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 6px 10px 12px;
	}
	.areas li + li {
		border-top: 1px solid var(--line);
	}
	.glyph {
		flex: none;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		color: var(--primary);
		background: var(--primary-soft);
		border-radius: 10px;
	}
	.area-text {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-width: 0;
	}
	.area-name {
		font-weight: 650;
		overflow-wrap: anywhere;
	}
	.area-sub {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.del {
		flex: none;
		color: var(--danger);
	}
	.del:hover {
		background: var(--danger-soft);
	}
</style>
