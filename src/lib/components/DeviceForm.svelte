<script lang="ts">
	import { app, live } from '#lib/client/app.svelte.ts';
	import type { LocalDevice } from '#lib/client/db.ts';
	import { createDevice, updateDevice } from '#lib/client/repo.ts';
	import { isMobileType } from '#lib/client/geo.ts';
	import { addPhoto } from '#lib/client/map/photos.ts';
	import { deviceSchema } from '#lib/shared/schemas.ts';
	import { t } from '#lib/strings.ts';
	import Icon from './Icon.svelte';

	let {
		device,
		lat = $bindable(0),
		lon = $bindable(0),
		accuracy = null,
		onsaved,
		oncancel
	}: {
		device?: LocalDevice;
		lat?: number;
		lon?: number;
		accuracy?: number | null;
		onsaved: (d: LocalDevice) => void;
		oncancel: () => void;
	} = $props();

	const s = t.device;
	const types = live(() => app.db.deviceTypes.toArray(), []);
	const cats = live(() => app.db.categories.toArray(), []);
	const statuses = live(() => app.db.statuses.toArray(), []);
	const groups = live(
		async () =>
			[...new Set((await app.db.devices.toArray()).map((d) => d.siteGroup).filter(Boolean))].sort(),
		[] as string[]
	);

	// svelte-ignore state_referenced_locally
	const d0 = device;
	let name = $state(d0?.name ?? '');
	let serial = $state(d0?.serial ?? '');
	let deviceTypeId = $state(d0?.deviceTypeId ?? '');
	let categoryId = $state(d0?.categoryId ?? '');
	let statusId = $state(d0?.statusId ?? '');
	let siteName = $state(d0?.siteName ?? '');
	let siteGroup = $state(d0?.siteGroup ?? '');
	let deployedOn = $state(d0?.deployedOn ?? '');
	let lastServiceOn = $state(d0?.lastServiceOn ?? '');
	let retrievalDueOn = $state(d0?.retrievalDueOn ?? '');
	let notes = $state(d0?.notes ?? '');
	let file = $state<File | null>(null);
	let errors = $state<string[]>([]);
	let busy = $state(false);

	const typeList = $derived(types.value.filter((x) => !x.deletedAt));
	const statusList = $derived(
		statuses.value.filter((x) => !x.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
	);
	const catList = $derived(
		cats.value.filter(
			(c) => !c.deletedAt && (c.deviceTypeId === null || c.deviceTypeId === deviceTypeId)
		)
	);
	const type = $derived(typeList.find((x) => x.id === deviceTypeId));
	const mobile = $derived(isMobileType(type));

	$effect(() => {
		if (!deviceTypeId && typeList.length) deviceTypeId = typeList[0].id;
		if (!statusId && statusList.length)
			statusId = (statusList.find((x) => x.key === 'recording') ?? statusList[0]).id;
	});
	$effect(() => {
		if (categoryId && !catList.some((c) => c.id === categoryId)) categoryId = '';
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		errors = [];
		const now = Date.now();
		const parsed = deviceSchema.safeParse({
			id: device?.id ?? crypto.randomUUID(),
			name,
			serial,
			deviceTypeId,
			categoryId: categoryId || null,
			statusId,
			lat: Number(lat),
			lon: Number(lon),
			siteName,
			siteGroup,
			deployedOn: deployedOn || null,
			lastServiceOn: lastServiceOn || null,
			retrievalDueOn: mobile ? retrievalDueOn || null : (device?.retrievalDueOn ?? null),
			notes,
			createdAt: device?.createdAt ?? now,
			updatedAt: now,
			deletedAt: null
		});
		if (!parsed.success) {
			errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
			return;
		}
		busy = true;
		try {
			const v = parsed.data;
			const fields = {
				name: v.name,
				serial: v.serial,
				deviceTypeId: v.deviceTypeId,
				categoryId: v.categoryId,
				statusId: v.statusId,
				siteName: v.siteName,
				siteGroup: v.siteGroup,
				deployedOn: v.deployedOn,
				lastServiceOn: v.lastServiceOn,
				retrievalDueOn: v.retrievalDueOn,
				notes: v.notes
			};
			const saved = device
				? await updateDevice(app.ctx(), device.id, fields)
				: await createDevice(app.ctx(), { ...fields, id: v.id, lat: v.lat, lon: v.lon });
			if (file) {
				try {
					await addPhoto(app.db, saved.id, file);
				} catch {
					errors = [s.photoFailed];
				}
			}
			onsaved(saved);
		} catch (err) {
			errors = [err instanceof Error ? err.message : String(err)];
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit}>
	<h2>{device ? s.editTitle : s.new}</h2>

	<fieldset>
		<legend class="sr-only">{s.sectionDevice}</legend>
		<label>{s.name}<input bind:value={name} required maxlength="120" /></label>
		<div class="row">
			<label>
				{s.type}
				<select bind:value={deviceTypeId} required>
					{#each typeList as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
				</select>
			</label>
			<label>
				{s.status}
				<select bind:value={statusId} required>
					{#each statusList as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
				</select>
			</label>
		</div>
		<div class="row">
			<label>
				{s.category}
				<select bind:value={categoryId}>
					<option value="">{s.noCategory}</option>
					{#each catList as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
				</select>
			</label>
			<label
				>{s.serial}<input bind:value={serial} maxlength="120" autocapitalize="characters" /></label
			>
		</div>
	</fieldset>

	{#if !device}
		<fieldset class="pos">
			<legend class="eyebrow">{s.sectionPosition}</legend>
			<p class="hint">
				<Icon name="pin" size={18} />
				<span>
					{t.mapui.positionHint}
					{#if accuracy != null}<br /><strong>{t.mapui.accuracy(accuracy)}</strong>{/if}
				</span>
			</p>
			<div class="row tight">
				<label
					>{t.mapui.lat}<input
						class="num"
						type="number"
						step="any"
						min="-90"
						max="90"
						bind:value={lat}
						required
					/></label
				>
				<label
					>{t.mapui.lon}<input
						class="num"
						type="number"
						step="any"
						min="-180"
						max="180"
						bind:value={lon}
						required
					/></label
				>
			</div>
		</fieldset>
	{/if}

	<fieldset>
		<legend class="eyebrow">{s.sectionSite}</legend>
		<label>{s.siteName}<input bind:value={siteName} maxlength="160" /></label>
		<label>
			{s.siteGroup}
			<input bind:value={siteGroup} maxlength="160" list="site-groups" />
			<datalist id="site-groups">
				{#each groups.value as g (g)}<option value={g}></option>{/each}
			</datalist>
		</label>
	</fieldset>

	<fieldset>
		<legend class="eyebrow">{s.sectionDates}</legend>
		<div class="row">
			<label>{s.deployedOn}<input type="date" bind:value={deployedOn} /></label>
			<label>{s.lastServiceOn}<input type="date" bind:value={lastServiceOn} /></label>
		</div>
		{#if mobile}
			<label>{s.retrievalDueOn}<input type="date" bind:value={retrievalDueOn} /></label>
		{/if}
	</fieldset>

	<fieldset>
		<legend class="eyebrow">{s.sectionNotes}</legend>
		<label>{s.notes}<textarea rows="3" bind:value={notes} maxlength="5000"></textarea></label>
		<label>
			{s.photo}
			<input
				type="file"
				accept="image/*"
				capture="environment"
				onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)}
			/>
		</label>
	</fieldset>

	{#each errors as e (e)}<p class="notice err" role="alert">{e}</p>{/each}
	<div class="actions">
		<button class="btn primary" disabled={busy}>{busy ? s.saving : s.save}</button>
		<button type="button" class="btn" onclick={oncancel}>{t.mapui.cancel}</button>
	</div>
</form>

<style>
	h2 {
		margin: 2px 0 6px;
		font-size: 1.35rem;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		padding: 0;
		margin: 18px 0 2px;
	}
	label {
		margin: 10px 0;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 0 10px;
	}
	.row.tight {
		grid-template-columns: 1fr 1fr;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.pos {
		margin-top: 6px;
		padding: 2px 14px 4px;
		background: var(--surface);
		border-radius: var(--radius);
	}
	.pos legend {
		float: left;
		width: 100%;
		margin-top: 12px;
	}
	.hint {
		clear: both;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 6px 0 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.hint :global(.icon) {
		margin-top: 2px;
		color: var(--focus);
	}
	.notice {
		margin: 12px 0 0;
	}
	.actions {
		position: sticky;
		bottom: 0;
		z-index: 2;
		display: flex;
		gap: 10px;
		margin: 16px -16px 0;
		padding: 10px 16px;
		padding-bottom: max(10px, env(safe-area-inset-bottom));
		background: var(--bg);
		border-top: 1px solid var(--line);
	}
	.actions .primary {
		flex: 1;
	}
</style>
