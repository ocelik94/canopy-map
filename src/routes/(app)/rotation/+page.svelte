<script lang="ts">
	import TripRoute from '#lib/components/TripRoute.svelte';
	import { app, live } from '#lib/client/app.svelte.ts';
	import { changeStatus } from '#lib/client/repo.ts';
	import { daysBetween, groupBy, isoDay, rotationDue } from '#lib/shared/planning.ts';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { t } from '#lib/strings.ts';

	const s = t.ops;
	const devices = live(() => app.db.devices.toArray(), []);
	const types = live(() => app.db.deviceTypes.toArray(), []);
	const statuses = live(() => app.db.statuses.toArray(), []);
	const settings = live(() => app.settings(), { maintenanceDays: 90, rotationDate: '' });

	let override = $state<string | null>(null);
	let error = $state('');
	let busy = $state<string | null>(null);

	const today = isoDay(Date.now());
	const dueDate = $derived(override ?? (settings.value.rotationDate || today));
	const liveStatuses = $derived(statuses.value.filter((x) => !x.deletedAt));
	const statusById = $derived(new Map(liveStatuses.map((x) => [x.id, x])));
	const retired = $derived(liveStatuses.find((x) => x.key === 'retrieved'));
	const items = $derived(
		rotationDue(
			devices.value,
			types.value.filter((x) => !x.deletedAt),
			dueDate,
			liveStatuses
		)
	);
	const grouped = $derived(
		[...groupBy(items, (x) => x.device.siteGroup).entries()].sort(([a], [b]) => a.localeCompare(b))
	);

	async function retrieve(id: string) {
		if (!retired) return (error = s.rotation.noStatus);
		error = '';
		busy = id;
		try {
			await changeStatus(app.ctx(), id, retired.id);
		} catch {
			error = s.rotation.failed;
		} finally {
			busy = null;
		}
	}
	const dueInfo = (due: string | null) => {
		if (!due) return null;
		const n = daysBetween(due, today);
		return n > 0
			? { value: t.ops.days(n), label: s.rotation.overdueLabel }
			: { value: t.ops.days(-n), label: s.rotation.dueInLabel };
	};
</script>

<div class="page">
	<header class="page-head">
		<h1>{s.rotation.title}</h1>
		<p>{s.rotation.subtitle}</p>
	</header>

	<div class="controls">
		<label>
			{s.rotation.dueBy}
			<input
				type="date"
				value={dueDate}
				onchange={(e) => (override = e.currentTarget.value || null)}
			/>
		</label>
		{#if override}
			<button class="btn ghost reset" type="button" onclick={() => (override = null)}
				>{t.ops.maintenance.reset}</button
			>
		{/if}
	</div>

	<h2 class="list-head">{s.rotation.count(items.length)}</h2>
	{#if error}<p class="notice err" role="alert">{error}</p>{/if}
	{#if !items.length}<p class="notice">{s.nothingDue}</p>{/if}
	<TripRoute devices={items.map((x) => x.device)} />

	{#each grouped as [group, list] (group)}
		<section class="group">
			<h3>
				<span class="gname">{group || s.noSite}</span>
				<span class="gcount num">{list.length}</span>
			</h3>
			<ul class="rows">
				{#each list as { device: d, dueOn } (d.id)}
					{@const st = statusById.get(d.statusId)}
					{@const info = dueInfo(dueOn)}
					<li class="row-card dev">
						<a class="grow link" href={`/?device=${d.id}`} aria-label={`${d.name}: ${s.showOnMap}`}>
							<span class="title">{d.name}</span>
							<span class="sub">{d.siteName || '-'}</span>
							{#if st}
								<span class="tags"><StatusBadge color={st.color} name={st.name} /></span>
							{/if}
						</a>
						<span class="metric" class:late={!!dueOn && dueOn < today}>
							{#if info}
								<span class="value num">{info.value}</span>
								<span class="unit">{info.label}</span>
							{:else}
								<span class="unit">{s.rotation.noDue}</span>
							{/if}
						</span>
						<button
							class="btn retrieve"
							type="button"
							disabled={busy === d.id}
							onclick={() => retrieve(d.id)}
						>
							{s.rotation.retrieve}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px 12px;
	}
	.controls label {
		flex: 0 1 16em;
		min-width: 0;
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.reset {
		color: var(--primary);
	}
	.list-head {
		margin: 20px 0 10px;
		font-size: 1rem;
		color: var(--muted);
	}
	.group + .group {
		margin-top: 22px;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 14px 0 8px;
	}
	.gname {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.gcount {
		flex: none;
		min-width: 26px;
		padding: 1px 8px;
		font-size: 0.8rem;
		text-align: center;
		color: var(--muted);
		background: var(--surface);
		border-radius: 999px;
	}
	.dev {
		align-items: flex-start;
	}
	.dev .link {
		display: block;
		flex: 1 1 0;
		color: inherit;
		text-decoration: none;
	}
	.link:hover .title {
		text-decoration: underline;
		text-underline-offset: 2px;
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
	}
	.metric .unit {
		font-size: 0.8rem;
		line-height: 1.25;
		color: var(--muted);
	}
	.metric.late .value,
	.metric.late .unit {
		color: var(--danger);
	}
	.metric.late .unit {
		font-weight: 650;
	}
	.retrieve {
		flex: 1 1 100%;
		color: var(--primary);
		border-color: var(--primary);
	}
	@media (min-width: 600px) {
		.dev {
			flex-wrap: nowrap;
			align-items: center;
		}
		.retrieve {
			flex: none;
		}
	}
</style>
