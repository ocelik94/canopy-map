<script lang="ts">
	import { app, live } from '#lib/client/app.svelte.ts';
	import { getMeta } from '#lib/client/db.ts';
	import type { LocalPhoto } from '#lib/client/db.ts';
	import { changeStatus, softDeleteDevice } from '#lib/client/repo.ts';
	import { detectMapsPlatform, formatCoord, mapsUrl } from '#lib/client/geo.ts';
	import { appleDirections, googleDirections } from '#lib/shared/route.ts';
	import { addPhoto } from '#lib/client/map/photos.ts';
	import StatusBadge from './StatusBadge.svelte';
	import Icon from './Icon.svelte';
	import { t, fmtDateTime } from '#lib/strings.ts';

	let {
		id,
		onclose,
		onedit,
		onmove,
		onshowpos,
		ondeleted
	}: {
		id: string;
		onclose: () => void;
		onedit: () => void;
		onmove: () => void;
		onshowpos: (lat: number, lon: number) => void;
		ondeleted: () => void;
	} = $props();

	const s = t.device;
	const QUICK = ['battery', 'card', 'collected', 'maintenance', 'faulty', 'retrieved'] as const;

	const device = live(() => app.db.devices.get(id), undefined);
	const types = live(() => app.db.deviceTypes.toArray(), []);
	const cats = live(() => app.db.categories.toArray(), []);
	const statuses = live(() => app.db.statuses.toArray(), []);
	const sHist = live(() => app.db.statusHistory.where('deviceId').equals(id).toArray(), []);
	const lHist = live(() => app.db.locationHistory.where('deviceId').equals(id).toArray(), []);
	const photos = live(
		() => app.db.photos.where('deviceId').equals(id).toArray(),
		[] as LocalPhoto[]
	);
	const users = live(
		() => getMeta<Record<string, string>>(app.db, 'users', {}),
		{} as Record<string, string>
	);

	const d = $derived(device.value);
	const st = $derived(statuses.value.find((x) => x.id === d?.statusId));
	const typ = $derived(types.value.find((x) => x.id === d?.deviceTypeId));
	const cat = $derived(cats.value.find((x) => x.id === d?.categoryId));
	const statusById = $derived(new Map(statuses.value.map((x) => [x.id, x])));
	const byKey = $derived(
		new Map(statuses.value.filter((x) => x.key && !x.deletedAt).map((x) => [x.key!, x]))
	);
	const sortedStatuses = $derived(
		statuses.value.filter((x) => !x.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
	);
	const quick = $derived(QUICK.filter((k) => byKey.has(k)));
	const statusLog = $derived([...sHist.value].sort((a, b) => b.createdAt - a.createdAt));
	const locLog = $derived([...lHist.value].sort((a, b) => b.recordedAt - a.recordedAt));
	const userName = (uid?: string) => (uid && users.value[uid]) || s.unknownUser;
	const when = (ms: number) => fmtDateTime(ms);

	let urls = $state<{ id: string; url: string }[]>([]);
	$effect(() => {
		const made: string[] = [];
		urls = photos.value.map((p) => {
			if (p.blob) {
				const u = URL.createObjectURL(p.blob);
				made.push(u);
				return { id: p.id, url: u };
			}
			return { id: p.id, url: `/api/photos/${p.id}` };
		});
		return () => made.forEach((u) => URL.revokeObjectURL(u));
	});

	let busy = $state(false);
	let err = $state('');
	let picking = $state(false);
	let pickId = $state('');
	let comment = $state('');
	let confirming = $state(false);
	let copied = $state(false);

	let done = $state('');
	let doneTimer: ReturnType<typeof setTimeout>;
	async function setStatus(statusId: string, c = '') {
		busy = true;
		err = '';
		try {
			await changeStatus(app.ctx(), id, statusId, c);
			picking = false;
			comment = '';
			done = t.device.statusSaved(statuses.value.find((x) => x.id === statusId)?.name ?? '');
			navigator.vibrate?.(40);
			clearTimeout(doneTimer);
			doneTimer = setTimeout(() => (done = ''), 4000);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
	async function remove() {
		await softDeleteDevice(app.ctx(), id);
		ondeleted();
	}
	async function copy() {
		if (!d) return;
		try {
			await navigator.clipboard.writeText(`${formatCoord(d.lat)}, ${formatCoord(d.lon)}`);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			err = '';
		}
	}
	async function onphoto(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!f) return;
		try {
			await addPhoto(app.db, id, f);
		} catch {
			err = s.photoFailed;
		}
	}

	const platform = detectMapsPlatform();
	function navTargets(dev: { lat: number; lon: number; name: string }) {
		const google = { label: t.navigate.google, href: googleDirections(dev.lat, dev.lon) };
		if (platform === 'ios')
			return [
				{ label: t.navigate.apple, href: appleDirections(dev.lat, dev.lon, dev.name) },
				google
			];
		if (platform === 'android')
			return [
				google,
				{ label: t.navigate.otherApp, href: mapsUrl(dev.lat, dev.lon, dev.name, 'android') }
			];
		return [
			google,
			{ label: t.navigate.osm, href: mapsUrl(dev.lat, dev.lon, dev.name, 'desktop') }
		];
	}
</script>

<div class="sheet">
	{#if !d}
		<p>{s.notFound}</p>
		<button class="btn" onclick={onclose}>{s.close}</button>
	{:else}
		<header class="head">
			<div class="ht">
				<h2>{d.name}</h2>
				<p class="meta">
					{typ?.name ?? s.none}{#if d.siteName}<span class="sep" aria-hidden="true">·</span
						>{d.siteName}{/if}
				</p>
			</div>
			<button class="btn ghost close" onclick={onclose} aria-label={s.close}>
				<Icon name="close" size={24} />
			</button>
		</header>
		{#if st}<div class="status"><StatusBadge color={st.color} name={st.name} large /></div>{/if}

		<p class="notice ok done" role="status" aria-live="polite">
			{#if done}<Icon name="check" size={20} stroke={2.5} />{done}{/if}
		</p>
		{#if err}<p class="notice err" role="alert">{err}</p>{/if}

		<h3 class="eyebrow">{s.quick}</h3>
		<div class="quick">
			{#each quick as k (k)}
				{@const q = byKey.get(k)!}
				<button class="qa" disabled={busy} style:--c={q.color} onclick={() => setStatus(q.id)}>
					<span class="qi" aria-hidden="true">{q.icon}</span>
					<span class="ql">{s.quickActions[k]}</span>
				</button>
			{/each}
		</div>
		{#if picking}
			<div class="card picker">
				<label>
					{s.status}
					<select bind:value={pickId}>
						<option value="" disabled>—</option>
						{#each sortedStatuses as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
					</select>
				</label>
				<label>{s.comment}<input bind:value={comment} maxlength="500" /></label>
				<div class="inline">
					<button
						class="btn primary"
						disabled={busy || !pickId}
						onclick={() => setStatus(pickId, comment)}
					>
						{s.apply}
					</button>
					<button class="btn" onclick={() => (picking = false)}>{t.mapui.cancel}</button>
				</div>
			</div>
		{:else}
			<button
				class="btn wide"
				onclick={() => {
					picking = true;
					pickId = d.statusId;
				}}>{s.changeStatus}</button
			>
		{/if}

		<div class="tools">
			<button class="tool" onclick={onedit}><Icon name="edit" />{s.edit}</button>
			<button class="tool" onclick={onmove}><Icon name="move" />{s.move}</button>
			<label class="tool">
				<Icon name="camera" />{s.addPhotoShort}
				<input type="file" accept="image/*" capture="environment" onchange={onphoto} hidden />
			</label>
		</div>

		<div class="nav" role="group" aria-label={t.navigate.title}>
			<span class="eyebrow">{t.navigate.title}</span>
			<div class="navbtns">
				{#each navTargets(d) as n (n.label)}
					<a class="btn" href={n.href} target="_blank" rel="noopener noreferrer"
						><Icon name="pin" size={20} />{n.label}</a
					>
				{/each}
			</div>
		</div>

		<h3 class="eyebrow">{s.details}</h3>
		<dl class="details">
			{#if d.serial}<div>
					<dt>{s.serial}</dt>
					<dd class="mono">{d.serial}</dd>
				</div>{/if}
			<div>
				<dt>{s.type}</dt>
				<dd>{typ?.name ?? s.none}</dd>
			</div>
			{#if cat}<div>
					<dt>{s.category}</dt>
					<dd>{cat.name}</dd>
				</div>{/if}
			{#if d.siteName}<div>
					<dt>{s.siteName}</dt>
					<dd>{d.siteName}</dd>
				</div>{/if}
			{#if d.siteGroup}<div>
					<dt>{s.siteGroup}</dt>
					<dd>{d.siteGroup}</dd>
				</div>{/if}
			{#if d.deployedOn}<div>
					<dt>{s.deployedOn}</dt>
					<dd class="num">{d.deployedOn}</dd>
				</div>{/if}
			{#if d.lastServiceOn}<div>
					<dt>{s.lastServiceOn}</dt>
					<dd class="num">{d.lastServiceOn}</dd>
				</div>{/if}
			{#if d.retrievalDueOn}<div>
					<dt>{s.retrievalDueOn}</dt>
					<dd class="num">{d.retrievalDueOn}</dd>
				</div>{/if}
			<div class="loc">
				<dt>{s.location}</dt>
				<dd>
					<span class="mono">{formatCoord(d.lat)}, {formatCoord(d.lon)}</span>
					<span class="inline">
						<button class="btn ghost sm" onclick={copy}
							><Icon name={copied ? 'check' : 'copy'} size={18} />{copied
								? s.copied
								: s.copy}</button
						>
					</span>
				</dd>
			</div>
			{#if d.notes}<div class="notes">
					<dt>{s.notes}</dt>
					<dd>{d.notes}</dd>
				</div>{/if}
		</dl>

		{#if urls.length}
			<h3 class="eyebrow">{s.photos}</h3>
			<div class="photos">
				{#each urls as p (p.id)}
					<a href={p.url} target="_blank" rel="noopener"
						><img src={p.url} alt="" loading="lazy" /></a
					>
				{/each}
			</div>
		{/if}

		<h3 class="eyebrow">{s.statusHistory}</h3>
		<ol class="timeline">
			{#each statusLog as e (e.id)}
				{@const ns = statusById.get(e.newStatusId)}
				<li style:--c={ns?.color ?? 'var(--muted)'}>
					<div class="tl-title">
						{#if e.oldStatusId}<span class="from">{statusById.get(e.oldStatusId)?.name ?? '?'}</span
							>
							<span class="arrow" aria-label={t.logs.activity.to}>→</span>
						{:else}<span class="from">{s.createdEvent}</span>{/if}
						<StatusBadge color={ns?.color ?? '#888'} name={ns?.name ?? '?'} />
					</div>
					<div class="tl-meta num">{when(e.createdAt)} · {s.by} {userName(e.userId)}</div>
					{#if e.comment && !(e.oldStatusId === null && e.comment === 'Device created')}
						<div class="tl-comment">{e.comment}</div>
					{/if}
				</li>
			{:else}
				<li class="muted empty">{s.empty}</li>
			{/each}
		</ol>

		<h3 class="eyebrow">{s.locationHistory}</h3>
		<ol class="timeline loc-tl">
			{#each locLog as e (e.id)}
				<li>
					<div class="tl-row">
						<div class="tl-main">
							<div class="tl-title"><strong>{e.siteName || s.none}</strong></div>
							<div class="mono tl-coords">{formatCoord(e.lat)}, {formatCoord(e.lon)}</div>
							<div class="tl-meta num">{when(e.recordedAt)} · {s.by} {userName(e.userId)}</div>
						</div>
						<button class="btn ghost sm" onclick={() => onshowpos(e.lat, e.lon)}>
							<Icon name="pin" size={18} />{s.showOnMap}
						</button>
					</div>
				</li>
			{:else}
				<li class="muted empty">{s.empty}</li>
			{/each}
		</ol>

		<div class="danger-zone">
			{#if confirming}
				<p class="notice err">{s.confirmDelete}</p>
				<div class="inline">
					<button class="btn danger" onclick={remove}
						><Icon name="trash" size={20} />{s.confirmYes}</button
					>
					<button class="btn" onclick={() => (confirming = false)}>{t.mapui.cancel}</button>
				</div>
			{:else}
				<button class="btn ghost del" onclick={() => (confirming = true)}
					><Icon name="trash" size={20} />{s.del}</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.sheet {
		padding: 0 16px 28px;
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.ht {
		flex: 1;
		min-width: 0;
	}
	h2 {
		margin: 2px 0 2px;
		font-size: 1.4rem;
		overflow-wrap: anywhere;
	}
	.meta {
		margin: 0;
		color: var(--muted);
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}
	.sep {
		margin: 0 7px;
	}
	.close {
		width: 48px;
		min-width: 48px;
		min-height: 48px;
		margin: -4px -8px 0 0;
		padding: 0;
		color: var(--muted);
		border-radius: 50%;
	}
	.status {
		margin: 10px 0 4px;
	}
	.done {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0 0;
	}
	.done:empty {
		display: none;
	}
	.eyebrow {
		margin: 22px 0 10px;
	}
	.quick {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 10px;
	}
	.qa {
		--c: var(--primary);
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 68px;
		padding: 10px 10px 10px 9px;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 650;
		line-height: 1.2;
		text-align: left;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--line);
		border-left: 5px solid var(--c);
		border-radius: 12px;
		box-shadow: var(--shadow-sm);
		cursor: pointer;
	}
	.qa:active {
		background: color-mix(in srgb, var(--c) 10%, white);
	}
	.qa:disabled {
		opacity: 0.55;
	}
	.qi {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		font-size: 1.15rem;
		background: color-mix(in srgb, var(--c) 14%, white);
		border-radius: 50%;
	}
	.ql {
		min-width: 0;
		overflow-wrap: break-word;
		hyphens: auto;
	}
	.picker {
		margin-top: 10px;
	}
	.picker label:first-child {
		margin-top: 0;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tools {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 12px;
	}
	.tool {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 64px;
		margin: 0;
		padding: 8px 4px;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 650;
		color: var(--fg);
		background: var(--surface);
		border: 0;
		border-radius: 12px;
		cursor: pointer;
	}
	.tool :global(.icon) {
		color: var(--primary);
	}
	.nav {
		margin-top: 14px;
	}
	.nav .eyebrow {
		display: block;
		margin-bottom: 8px;
	}
	.navbtns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.navbtns .btn {
		gap: 6px;
		padding: 0 10px;
		white-space: nowrap;
	}
	.navbtns .btn :global(.icon) {
		color: var(--primary);
	}
	.details {
		margin: 0;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.details > div {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 16px;
		padding: 11px 14px;
	}
	.details > div + div {
		border-top: 1px solid var(--line);
	}
	dt {
		color: var(--muted);
		font-size: 0.92rem;
	}
	dd {
		margin: 0;
		min-width: 0;
		font-weight: 600;
		text-align: right;
		overflow-wrap: anywhere;
	}
	.loc dd,
	.notes dd {
		flex-basis: 100%;
		text-align: left;
	}
	.loc dd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	.notes dd {
		font-weight: 400;
		white-space: pre-wrap;
	}
	.sm {
		min-height: 40px;
		padding: 6px 10px;
		font-size: 0.88rem;
		color: var(--primary);
	}
	.photos {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 8px;
	}
	.photos img {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 10px;
		border: 1px solid var(--line);
	}
	.timeline {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.timeline li {
		--c: var(--line);
		position: relative;
		padding: 0 0 16px 24px;
	}
	.timeline li::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 8px;
		width: 10px;
		height: 10px;
		background: var(--c);
		border: 2px solid var(--bg);
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--line);
	}
	.timeline li:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 9px;
		top: 22px;
		bottom: 2px;
		width: 2px;
		background: var(--line);
	}
	.loc-tl li {
		--c: var(--primary);
	}
	.timeline li.empty::before,
	.timeline li.empty::after {
		display: none;
	}
	.timeline li.empty {
		padding-left: 0;
	}
	.tl-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.from {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.arrow {
		color: var(--muted);
	}
	.tl-meta {
		margin-top: 3px;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.tl-comment {
		margin-top: 6px;
		padding: 8px 10px;
		font-size: 0.92rem;
		background: var(--surface);
		border-radius: 8px;
		overflow-wrap: anywhere;
	}
	.tl-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 4px 10px;
	}
	.tl-main {
		flex: 1 1 180px;
		min-width: 0;
	}
	.tl-coords {
		color: var(--fg);
	}
	.danger-zone {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}
	.danger-zone .notice {
		margin: 0 0 10px;
	}
	.del {
		color: var(--danger);
	}
</style>
