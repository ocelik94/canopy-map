<script lang="ts">
	import { app } from '#lib/client/app.svelte.ts';
	import { getMeta } from '#lib/client/db.ts';
	import { createDevice, updateDevice } from '#lib/client/repo.ts';
	import {
		devicesToCsv,
		devicesToGeoJson,
		parseDeviceCsv,
		serviceLogToCsv,
		type ParseResult,
		type Refs
	} from '#lib/shared/export.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { t } from '#lib/strings.ts';

	const s = t.ops.data;
	let preview = $state<ParseResult | null>(null);
	let message = $state('');
	let failure = $state('');
	let busy = $state(false);

	async function refs(): Promise<Refs> {
		const [types, categories, statuses] = await Promise.all([
			app.db.deviceTypes.toArray(),
			app.db.categories.toArray(),
			app.db.statuses.toArray()
		]);
		return {
			types: types.filter((x) => !x.deletedAt),
			categories: categories.filter((x) => !x.deletedAt),
			statuses: statuses.filter((x) => !x.deletedAt)
		};
	}

	function download(name: string, content: string, mime: string) {
		const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name}-${new Date().toISOString().slice(0, 10)}`;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}
	async function guard(fn: () => Promise<void>) {
		failure = message = '';
		try {
			await fn();
		} catch (e) {
			failure = e instanceof Error ? e.message : String(e);
		}
	}

	const exportDevices = () =>
		guard(async () => {
			const [d, r] = [await app.db.devices.toArray(), await refs()];
			download('canopy-devices.csv', '﻿' + devicesToCsv(d, r), 'text/csv');
		});
	const exportGeoJson = () =>
		guard(async () => {
			const [d, r] = [await app.db.devices.toArray(), await refs()];
			download(
				'canopy-devices.geojson',
				JSON.stringify(devicesToGeoJson(d, r), null, 2),
				'application/geo+json'
			);
		});
	const exportLog = () =>
		guard(async () => {
			const [e, d, r, u] = [
				await app.db.statusHistory.toArray(),
				await app.db.devices.toArray(),
				await refs(),
				await getMeta<Record<string, string>>(app.db, 'users', {})
			];
			download('canopy-service-log.csv', '﻿' + serviceLogToCsv(e, d, r.statuses, u), 'text/csv');
		});

	function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		preview = null;
		if (!file) return;
		void guard(async () => {
			const text = await file.text();
			const existing = new Set(
				(await app.db.devices.toArray()).filter((d) => !d.deletedAt).map((d) => d.id)
			);
			preview = parseDeviceCsv(text, await refs(), { existingIds: existing });
		});
	}

	async function confirmImport() {
		if (!preview || busy) return;
		busy = true;
		await guard(async () => {
			const ctx = app.ctx();
			let n = 0;
			for (const { device, update } of preview!.valid) {
				if (update) {
					const { id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...patch } = device;
					await updateDevice(ctx, id, patch, 'CSV import');
				} else {
					await createDevice(ctx, device);
				}
				n++;
			}
			message = s.imported(n);
			preview = null;
			void app.engine.sync();
		});
		busy = false;
	}
</script>

<div class="page">
	<header class="page-head">
		<h1>{s.title}</h1>
		<p>{s.subtitle}</p>
	</header>

	<section class="card">
		<h2>{s.export}</h2>
		<div class="exports">
			<button class="btn export" type="button" onclick={exportDevices}>
				<span class="ico"><Icon name="download" size={20} /></span>
				<span class="txt">
					<span class="name">{s.devicesCsv}</span>
					<span class="desc">{s.devicesCsvHelp}</span>
				</span>
			</button>
			<button class="btn export" type="button" onclick={exportGeoJson}>
				<span class="ico"><Icon name="download" size={20} /></span>
				<span class="txt">
					<span class="name">{s.devicesGeoJson}</span>
					<span class="desc">{s.devicesGeoJsonHelp}</span>
				</span>
			</button>
			<button class="btn export" type="button" onclick={exportLog}>
				<span class="ico"><Icon name="download" size={20} /></span>
				<span class="txt">
					<span class="name">{s.serviceLog}</span>
					<span class="desc">{s.serviceLogHelp}</span>
				</span>
			</button>
		</div>
	</section>

	<section class="card">
		<h2>{s.import}</h2>
		<p class="help">{s.importHelp}</p>
		<label>
			{s.chooseFile}
			<input type="file" accept=".csv,text/csv" onchange={onFile} />
		</label>
		{#if failure}<p class="notice err" role="alert">{failure}</p>{/if}
		{#if message}<p class="notice ok" role="status">{message}</p>{/if}

		{#if preview}
			{@const upd = preview.valid.filter((v) => v.update).length}
			<p class="summary" role="status">
				{s.preview(preview.valid.length, upd, preview.errors.length)}
			</p>
			{#if preview.errors.length}
				<div class="notice err">
					<ul class="errors">
						{#each preview.errors as e (e.line + e.message)}
							<li><span class="num">{s.line(e.line)}</span>: {e.message}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if preview.valid.length}
				<div class="table">
					<table>
						<thead>
							<tr
								><th class="num">#</th><th></th><th>Name</th><th>Serial</th><th>Lat</th><th>Lon</th
								><th>Site</th></tr
							>
						</thead>
						<tbody>
							{#each preview.valid.slice(0, 50) as v (v.line)}
								<tr>
									<td class="num muted">{v.line}</td>
									<td
										><span class="badge" style:--c={v.update ? '#b7791f' : 'var(--primary)'}
											><span class="label">{v.update ? s.update : s.new}</span></span
										></td
									>
									<td class="strong">{v.device.name}</td>
									<td class="mono">{v.device.serial}</td>
									<td class="num">{v.device.lat}</td>
									<td class="num">{v.device.lon}</td>
									<td>{v.device.siteName}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if preview.valid.length > 50}<p class="muted more">… +{preview.valid.length - 50}</p>{/if}
			{/if}
			<div class="buttons">
				<button
					class="btn primary"
					type="button"
					disabled={busy || !preview.valid.length}
					onclick={confirmImport}
				>
					{s.confirm(preview.valid.length)}
				</button>
				<button class="btn" type="button" onclick={() => (preview = null)}>{s.cancel}</button>
			</div>
		{/if}
	</section>
</div>

<style>
	.card + .card {
		margin-top: 16px;
	}
	.card h2 {
		margin: 0 0 12px;
	}
	.exports {
		display: grid;
		gap: 10px;
	}
	@media (min-width: 700px) {
		.exports {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.export {
		justify-content: flex-start;
		gap: 12px;
		min-height: 64px;
		padding: 12px 14px;
		text-align: left;
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		color: var(--primary);
		background: var(--primary-soft);
		border-radius: 10px;
	}
	.txt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		overflow-wrap: anywhere;
	}
	.desc {
		font-size: 0.85rem;
		font-weight: 400;
		color: var(--muted);
	}
	.help {
		margin: 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.notice {
		margin: 12px 0;
	}
	.summary {
		margin: 16px 0 8px;
		font-weight: 650;
	}
	.errors {
		margin: 0;
		padding-left: 18px;
	}
	.errors li + li {
		margin-top: 4px;
	}
	.table {
		max-height: 420px;
		overflow: auto;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
	}
	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 0.92rem;
	}
	th,
	td {
		padding: 9px 12px;
		text-align: left;
		white-space: nowrap;
		border-bottom: 1px solid var(--line);
	}
	th {
		position: sticky;
		top: 0;
		z-index: 1;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
		background: var(--surface);
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	tbody tr:nth-child(even) td {
		background: #f9faf9;
	}
	.strong {
		font-weight: 650;
	}
	.more {
		margin: 6px 0 0;
		font-size: 0.9rem;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 16px;
	}
	@media (max-width: 599px) {
		.buttons > .btn {
			flex: 1 1 100%;
		}
	}
</style>
