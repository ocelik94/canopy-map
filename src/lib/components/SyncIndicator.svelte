<script lang="ts">
	import { app, live } from '#lib/client/app.svelte.ts';
	import type { SyncIssue } from '#lib/client/sync.ts';
	import { t, fmtDateTime } from '#lib/strings.ts';
	import Icon from './Icon.svelte';

	const s = t.mapui.sync;
	let open = $state(false);
	let root: HTMLDivElement;
	const issues = live(
		async () => ((await app.db.meta.get('issues'))?.value as SyncIssue[] | undefined) ?? [],
		[] as SyncIssue[]
	);
	const st = $derived(app.sync);
	const bad = $derived(st.needsLogin || !!st.error || issues.value.length > 0);
	const when = (ms: number | null) => (ms ? fmtDateTime(ms) : s.never);
</script>

<svelte:window
	onclick={(e) => open && !root.contains(e.target as Node) && (open = false)}
	onkeydown={(e) => e.key === 'Escape' && (open = false)}
/>

<div class="sync" bind:this={root}>
	<button
		class="status"
		class:off={!st.online}
		class:pending={st.pending > 0}
		class:bad
		aria-expanded={open}
		aria-label="{st.online ? s.online : s.offline}, {s.pending(st.pending)}"
		onclick={() => (open = !open)}
	>
		<span class="ico" aria-hidden="true">
			{#if st.syncing}<span class="spin"><Icon name="sync" size={18} /></span>
			{:else if st.online}<Icon name="cloud" size={18} />
			{:else}<Icon name="cloudOff" size={18} />{/if}
		</span>
		<span class="txt">{st.online ? s.online : s.offline}</span>
		{#if st.pending > 0}<span class="n num">{st.pending}</span>{/if}
		{#if bad}<span class="alert" aria-hidden="true">!</span>{/if}
	</button>
	{#if open}
		<div class="panel" role="status">
			<div class="ph">
				<span class="state" class:off={!st.online}></span>
				<strong>{st.online ? s.online : s.offline}</strong>
			</div>
			<dl>
				<dt>{s.pendingLabel}</dt>
				<dd class="num">{s.pending(st.pending)}</dd>
				<dt>{s.lastSync}</dt>
				<dd class="num">{when(st.lastSyncAt)}</dd>
				{#if app.storage}
					<dt>{t.mapui.storage.label}</dt>
					<dd class:warn={app.storage !== 'persisted'}>
						{app.storage === 'persisted'
							? t.mapui.storage.persisted
							: app.storage === 'not-persisted'
								? t.mapui.storage.notPersisted
								: t.mapui.storage.unsupported}
					</dd>
				{/if}
			</dl>
			{#if st.error}<p class="notice err">{st.error}</p>{/if}
			{#if st.needsLogin}
				<p class="notice err">{s.signIn} <a href="/login">{s.signInLink}</a></p>
			{/if}
			{#if issues.value.length}
				<div class="notice err">
					<p>{s.issues}</p>
					<ul>
						{#each issues.value as i (i.mutationId)}
							<li><span class="num">{fmtDateTime(i.at)}</span>: {i.reason}</li>
						{/each}
					</ul>
					<button class="btn" onclick={() => app.db.meta.delete('issues')}>{s.dismiss}</button>
				</div>
			{/if}
			<button class="btn primary wide" disabled={st.syncing} onclick={() => void app.engine.sync()}>
				<Icon name="sync" size={20} />{st.syncing ? s.syncing : s.syncNow}
			</button>
		</div>
	{/if}
</div>

<style>
	.sync {
		position: relative;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 44px;
		padding: 6px 12px;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 650;
		color: var(--primary);
		background: var(--primary-soft);
		border: 1px solid transparent;
		border-radius: 999px;
		cursor: pointer;
	}
	.status.off {
		color: var(--muted);
		background: var(--surface);
	}
	.status.pending:not(.bad) {
		color: #8a4b05;
		background: #fdf1df;
	}
	.status.bad {
		color: var(--danger);
		background: var(--danger-soft);
	}
	.ico {
		display: grid;
	}
	.spin {
		display: grid;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
	.n {
		min-width: 22px;
		padding: 1px 7px;
		font-size: 0.78rem;
		text-align: center;
		color: #fff;
		background: #b45309;
		border-radius: 999px;
	}
	.alert {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		font-size: 0.75rem;
		font-weight: 800;
		color: #fff;
		background: var(--danger);
		border-radius: 50%;
	}
	@media (max-width: 360px) {
		.txt {
			display: none;
		}
	}
	.panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 30;
		width: min(320px, calc(100vw - 24px));
		padding: 14px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
	}
	.ph {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.05rem;
	}
	.state {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #2e7d32;
	}
	.state.off {
		background: #9aa59f;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 12px 0;
		font-size: 0.92rem;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		text-align: right;
	}
	dd.warn {
		color: #8a4b05;
		font-weight: 600;
	}
	.notice {
		margin: 0 0 12px;
		font-size: 0.92rem;
	}
	.notice p {
		margin: 0 0 6px;
	}
	.notice ul {
		margin: 0 0 10px;
		padding-left: 18px;
		font-weight: 400;
	}
</style>
