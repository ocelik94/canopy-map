<script lang="ts">
	import TripRoute from '#lib/components/TripRoute.svelte';
	import { app, live } from '#lib/client/app.svelte.ts';
	import { devicesDueForService, groupByStatus, isoDay } from '#lib/shared/planning.ts';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { t } from '#lib/strings.ts';

	const s = t.ops;
	const devices = live(() => app.db.devices.toArray(), []);
	const statuses = live(() => app.db.statuses.toArray(), []);
	const settings = live(() => app.settings(), { maintenanceDays: 90, rotationDate: '' });

	let override = $state<number | null>(null);
	let statusFilter = $state('');
	let groupFilter = $state('');

	const days = $derived(override ?? settings.value.maintenanceDays);
	const today = isoDay(Date.now());
	const liveStatuses = $derived(statuses.value.filter((x) => !x.deletedAt));
	const statusById = $derived(new Map(liveStatuses.map((x) => [x.id, x])));
	const groups = $derived(
		[...new Set(devices.value.filter((d) => !d.deletedAt).map((d) => d.siteGroup))].sort()
	);
	const due = $derived(
		devicesDueForService(devices.value, today, Math.max(1, days), liveStatuses).filter(
			(x) => !groupFilter || x.device.siteGroup === (groupFilter === '\u0000' ? '' : groupFilter)
		)
	);
	const counts = $derived(groupByStatus(due));
	const shown = $derived(due.filter((x) => !statusFilter || x.device.statusId === statusFilter));
</script>

<div class="page">
	<header class="page-head">
		<h1>{s.maintenance.title}</h1>
		<p>{s.maintenance.subtitle}</p>
	</header>

	<div class="controls">
		<label>
			{s.maintenance.days}
			<input
				type="number"
				inputmode="numeric"
				min="1"
				max="3650"
				value={days}
				oninput={(e) => {
					const n = e.currentTarget.valueAsNumber;
					override = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
				}}
			/>
		</label>
		<label>
			{s.siteGroup}
			<select bind:value={groupFilter}>
				<option value="">{s.allGroups}</option>
				{#each groups as g (g)}
					<option value={g || '\u0000'}>{g || s.noSite}</option>
				{/each}
			</select>
		</label>
	</div>
	<p class="hint">
		<span>{s.maintenance.defaultDays(settings.value.maintenanceDays)}</span>
		{#if override !== null}
			<button class="btn ghost reset" type="button" onclick={() => (override = null)}
				>{s.maintenance.reset}</button
			>
		{/if}
	</p>

	<div class="chips" role="group" aria-label={t.ops.statusFilter}>
		<button
			class="chip"
			class:on={!statusFilter}
			aria-pressed={!statusFilter}
			onclick={() => (statusFilter = '')}
		>
			{s.all}
			<span class="count num">{due.length}</span>
		</button>
		{#each liveStatuses as st (st.id)}
			{#if counts.get(st.id)}
				<button
					class="chip"
					class:on={statusFilter === st.id}
					aria-pressed={statusFilter === st.id}
					onclick={() => (statusFilter = statusFilter === st.id ? '' : st.id)}
				>
					<span class="dot" style:--c={st.color} aria-hidden="true"></span>
					{st.name}
					<span class="count num">{counts.get(st.id)!.length}</span>
				</button>
			{/if}
		{/each}
	</div>

	<h2 class="list-head">{s.maintenance.count(shown.length)}</h2>
	{#if !shown.length}<p class="notice">{s.nothingDue}</p>{/if}
	<TripRoute devices={shown.map((x) => x.device)} />
	<ul class="rows">
		{#each shown as { device: d, daysSince, neverServiced } (d.id)}
			{@const st = statusById.get(d.statusId)}
			<li>
				<a class="row-card dev" href={`/?device=${d.id}`} aria-label={`${d.name}: ${s.showOnMap}`}>
					<span class="grow">
						<span class="title">{d.name}</span>
						<span class="sub">{d.siteName || '-'}{d.siteGroup ? ` · ${d.siteGroup}` : ''}</span>
						{#if st}
							<span class="tags"><StatusBadge color={st.color} name={st.name} /></span>
						{/if}
					</span>
					<span class="metric">
						<span class="value num">{t.ops.days(daysSince)}</span>
						<span class="unit">{neverServiced ? s.neverServiced : s.maintenance.sinceLabel}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	.controls {
		display: grid;
		grid-template-columns: 7.5em minmax(0, 1fr);
		align-items: start;
		gap: 12px;
	}
	@media (min-width: 600px) {
		.controls {
			grid-template-columns: 12em minmax(0, 20em);
		}
	}
	.controls label {
		margin: 0;
		min-width: 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.hint {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		min-height: 28px;
		margin: 8px 0 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.reset {
		min-height: 36px;
		padding: 4px 10px;
		font-size: 0.9rem;
		color: var(--primary);
	}
	.dot {
		flex: none;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--c);
	}
	.list-head {
		margin: 8px 0 10px;
		font-size: 1rem;
		color: var(--muted);
	}
	.dev {
		flex-wrap: nowrap;
		align-items: flex-start;
	}
	.dev .grow {
		flex: 1 1 auto;
	}
	.dev .tags {
		margin-top: 8px;
	}
	.metric {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		max-width: 40%;
		text-align: right;
	}
	.metric .value {
		font-size: 1.15rem;
		font-weight: 750;
		line-height: 1.2;
		white-space: nowrap;
		color: #9a4f00;
	}
	.metric .unit {
		font-size: 0.8rem;
		line-height: 1.25;
		color: var(--muted);
	}
</style>
