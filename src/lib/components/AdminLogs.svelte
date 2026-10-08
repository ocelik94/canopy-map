<script lang="ts">
	import { onMount } from 'svelte';
	import { t, fmtDateTime } from '#lib/strings.ts';
	import Icon from './Icon.svelte';

	let { kind }: { kind: 'access' | 'activity' } = $props();
	const s = t.logs;

	interface AccessEntry {
		id: number;
		at: number;
		event: 'login' | 'login_failed' | 'login_throttled' | 'logout';
		username: string;
		ip: string;
		userAgent: string;
	}
	interface ActivityEntry {
		id: number;
		at: number;
		receivedAt: number;
		username: string | null;
		action: string;
		entity: string;
		entityId: string;
		label: string;
		detail: Record<string, unknown> | null;
	}

	let entries = $state<(AccessEntry | ActivityEntry)[]>([]);
	let next = $state<string | null>(null);
	let loading = $state(false);
	let error = $state('');
	let q = $state('');
	let filter = $state('');
	let timer: ReturnType<typeof setTimeout>;
	const accessEntries = $derived(entries as AccessEntry[]);
	const activityEntries = $derived(entries as ActivityEntry[]);

	async function load(append = false) {
		loading = true;
		error = '';
		const p = new URLSearchParams({ type: kind });
		if (q.trim()) p.set('q', q.trim());
		if (filter) p.set(kind === 'access' ? 'event' : 'entity', filter);
		if (append && next) p.set('cursor', next);
		try {
			const res = await fetch(`/api/admin/logs?${p}`, { cache: 'no-store' });
			if (!res.ok) throw new Error(String(res.status));
			const j = (await res.json()) as { entries: typeof entries; next: string | null };
			entries = append ? [...entries, ...j.entries] : j.entries;
			next = j.next;
		} catch {
			error = s.needsConnection;
		} finally {
			loading = false;
		}
	}
	onMount(() => void load());
	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => void load(), 300);
	}

	const when = (ms: number) => fmtDateTime(ms);
	const fieldName = (k: string) => (s.fields as Record<string, string>)[k] ?? k;

	const ACCESS: Record<AccessEntry['event'], { label: string; tone: string }> = {
		login: { label: s.access.login, tone: '#2e7d32' },
		login_failed: { label: s.access.login_failed, tone: '#b42318' },
		login_throttled: { label: s.access.login_throttled, tone: '#b45309' },
		logout: { label: s.access.logout, tone: '#6b7570' }
	};

	function describe(e: ActivityEntry): { title: string; sub: string } {
		const d = e.detail ?? {};
		const what = (s.entities as Record<string, string>)[e.entity] ?? e.entity;
		switch (e.action) {
			case 'device.created':
				return { title: s.activity.created(e.label), sub: d.site ? String(d.site) : '' };
			case 'device.edited':
				return {
					title: s.activity.edited(e.label),
					sub: ((d.fields as string[]) ?? []).map(fieldName).join(', ')
				};
			case 'device.status':
				return {
					title: s.activity.status(e.label, String(d.to ?? '?')),
					sub: [d.from ? `${s.activity.from} ${d.from}` : '', d.comment ? `“${d.comment}”` : '']
						.filter(Boolean)
						.join(' · ')
				};
			case 'device.moved':
				return {
					title: s.activity.moved(e.label),
					sub: d.site ? `${s.activity.to} ${d.site}` : ''
				};
			case 'device.deleted':
				return { title: s.activity.deleted(e.label), sub: '' };
			case 'admin.created':
				return {
					title: s.activity.adminCreated(what, e.label),
					sub: d.role ? `${s.fields.role}: ${d.role}` : ''
				};
			case 'admin.deleted':
				return { title: s.activity.adminDeleted(what, e.label), sub: '' };
			case 'admin.updated': {
				const parts: string[] = [];
				if (Array.isArray(d.fields)) parts.push((d.fields as string[]).map(fieldName).join(', '));
				if (d.role) parts.push(`${s.fields.role}: ${d.role}`);
				if (d.disabled !== undefined)
					parts.push(d.disabled ? s.activity.disabled : s.activity.enabled);
				if (d.passwordReset) parts.push(s.activity.passwordReset);
				if (e.entity === 'settings')
					parts.push(
						Object.entries(d)
							.map(([k, v]) => `${fieldName(k)}: ${v || '—'}`)
							.join(', ')
					);
				return {
					title: s.activity.adminUpdated(what, e.label),
					sub: parts.filter(Boolean).join(' · ')
				};
			}
			default:
				return { title: `${e.action} ${e.label}`, sub: '' };
		}
	}
	const ICON: Record<string, 'plus' | 'edit' | 'sync' | 'move' | 'trash' | 'settings'> = {
		'device.created': 'plus',
		'device.edited': 'edit',
		'device.status': 'sync',
		'device.moved': 'move',
		'device.deleted': 'trash',
		'admin.created': 'plus',
		'admin.updated': 'settings',
		'admin.deleted': 'trash'
	};
</script>

<div class="bar">
	<label class="search">
		<span class="sr-only">{s.search}</span>
		<Icon name="search" size={20} />
		<input
			type="search"
			placeholder={kind === 'access' ? s.searchAccess : s.searchActivity}
			bind:value={q}
			oninput={onSearch}
		/>
	</label>
	<label class="filter">
		<span class="sr-only">{s.filter}</span>
		<select bind:value={filter} onchange={() => void load()}>
			<option value="">{s.all}</option>
			{#if kind === 'access'}
				{#each Object.entries(ACCESS) as [k, v] (k)}<option value={k}>{v.label}</option>{/each}
			{:else}
				{#each Object.entries(s.entities) as [k, v] (k)}<option value={k}>{v}</option>{/each}
			{/if}
		</select>
	</label>
	<button
		class="btn ghost refresh"
		aria-label={s.refresh}
		title={s.refresh}
		onclick={() => void load()}
		disabled={loading}
	>
		<Icon name="sync" size={20} />
	</button>
</div>

{#if error}<p class="notice err" role="alert">{error}</p>{/if}
{#if kind === 'access'}<p class="muted note">{s.retention}</p>{/if}

<ul class="rows" aria-busy={loading}>
	{#if kind === 'access'}
		{#each accessEntries as e (e.id)}
			{@const a = ACCESS[e.event]}
			<li class="row-card entry">
				<span class="dot" style:--c={a.tone} aria-hidden="true"></span>
				<div class="grow">
					<span class="title">{e.username || '—'}</span>
					<span class="sub">{[e.ip, e.userAgent].filter(Boolean).join(' · ')}</span>
					<span class="tags line">
						<span class="badge" style:--c={a.tone}><span class="label">{a.label}</span></span>
						<time class="meta num" datetime={new Date(e.at).toISOString()}>{when(e.at)}</time>
					</span>
				</div>
			</li>
		{/each}
	{:else}
		{#each activityEntries as e (e.id)}
			{@const d = describe(e)}
			<li class="row-card entry">
				<span class="ico" aria-hidden="true"
					><Icon name={ICON[e.action] ?? 'edit'} size={18} /></span
				>
				<div class="grow">
					{#if e.entity === 'device' && e.action !== 'device.deleted'}
						<a class="title" href={`/?device=${e.entityId}`}>{d.title}</a>
					{:else}
						<span class="title">{d.title}</span>
					{/if}
					{#if d.sub}<span class="sub">{d.sub}</span>{/if}
					<span class="meta num">
						{e.username ?? '?'} · <time datetime={new Date(e.at).toISOString()}>{when(e.at)}</time>
						{#if e.receivedAt - e.at > 10 * 60_000}<span class="late"
								>· {s.syncedLater(when(e.receivedAt))}</span
							>{/if}
					</span>
				</div>
			</li>
		{/each}
	{/if}
	{#if !loading && !entries.length && !error}<li class="muted empty">{s.empty}</li>{/if}
</ul>

{#if next}
	<button class="btn wide more" onclick={() => void load(true)} disabled={loading}
		>{loading ? s.loading : s.more}</button
	>
{/if}

<style>
	.bar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 8px;
		align-items: start;
	}
	@media (max-width: 480px) {
		.bar {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.filter {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
	.bar label {
		margin: 0;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--muted);
	}
	.search :global(.icon) {
		position: absolute;
		left: 13px;
		pointer-events: none;
	}
	.search input {
		margin: 0;
		padding-left: 42px;
	}
	.filter select {
		margin: 0;
		min-width: 9.5em;
	}
	.refresh {
		width: var(--tap);
		padding: 0;
		border-color: var(--line);
		background: var(--bg);
	}
	.note {
		margin: 8px 0 0;
		font-size: 0.85rem;
	}
	.rows {
		margin-top: 12px;
	}
	.entry {
		flex-wrap: nowrap;
		align-items: flex-start;
		min-height: 0;
		padding: 11px 13px;
	}
	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		margin-top: 7px;
		border-radius: 50%;
		background: var(--c);
	}
	.ico {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		color: var(--primary);
		background: var(--primary-soft);
		border-radius: 50%;
	}
	a.title {
		color: var(--fg);
		text-decoration: none;
	}
	a.title:hover {
		text-decoration: underline;
	}
	.meta {
		display: block;
		margin-top: 2px;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.late {
		color: #8a4b05;
	}
	.line {
		margin-top: 6px;
		column-gap: 10px;
	}
	.line .meta {
		margin: 0;
	}
	.empty {
		padding: 16px 4px;
	}
	.more {
		margin-top: 12px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
