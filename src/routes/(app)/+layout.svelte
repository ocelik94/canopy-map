<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { app } from '#lib/client/app.svelte.ts';
	import { registerServiceWorker } from '#lib/client/register-sw.ts';
	import { isInstalled } from '#lib/client/storage.ts';
	import { detectMapsPlatform } from '#lib/client/geo.ts';
	import SyncIndicator from '#lib/components/SyncIndicator.svelte';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import { t, lang, LANGUAGE_NAMES, setLanguage, type Lang } from '#lib/strings.ts';

	let { children } = $props();
	let menuOpen = $state(false);
	let applyUpdate = $state<(() => void) | null>(null);

	const WARN_KEY = 'canopy.storageWarnDismissed';
	let warnDismissed = $state(false);
	const showStorageWarn = $derived(
		app.storage === 'not-persisted' && !warnDismissed && !isInstalled()
	);
	const installHow = $derived(
		detectMapsPlatform() === 'android' ? t.mapui.storage.howAndroid : t.mapui.storage.howIos
	);
	function dismissWarn() {
		warnDismissed = true;
		try {
			localStorage.setItem(WARN_KEY, String(Date.now()));
		} catch {}
	}

	onMount(() => {
		try {
			warnDismissed = Date.now() - Number(localStorage.getItem(WARN_KEY) ?? 0) < 7 * 86_400_000;
		} catch {}
		void app.init();
		void registerServiceWorker({ onUpdate: (apply) => (applyUpdate = apply) });
	});

	const tabs = $derived<{ href: string; label: string; short?: string; icon: IconName }[]>([
		{ href: '/', label: t.nav.map, icon: 'map' },
		{
			href: '/maintenance',
			label: t.nav.maintenance,
			short: t.nav.maintenanceShort,
			icon: 'wrench'
		},
		{ href: '/rotation', label: t.nav.rotation, icon: 'rotate' },
		{ href: '/data', label: t.mapui.navData, icon: 'file' },
		...(app.user?.role === 'admin'
			? [{ href: '/admin', label: t.nav.admin, icon: 'settings' as const }]
			: [])
	]);
	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)} />

{#if !app.ready}
	<div class="splash" role="status">
		<img src="/icons/icon.svg" alt="" width="56" height="56" />
		<p>{t.mapui.loading}</p>
	</div>
{:else}
	<div class="shell">
		<header>
			<a class="brand" href="/" aria-label={t.appName}>
				<img src="/icons/icon.svg" alt="" width="30" height="30" />
				<span>{t.appName}</span>
			</a>
			<nav class="tabs top" aria-label={t.nav.main}>
				{#each tabs as l (l.href)}
					<a
						href={l.href}
						class:active={current(l.href)}
						aria-current={current(l.href) ? 'page' : undefined}
					>
						<Icon name={l.icon} size={20} />{l.label}
					</a>
				{/each}
			</nav>
			<div class="right">
				<SyncIndicator />
				<div class="menu">
					<button
						class="btn ghost iconbtn"
						aria-label={t.mapui.menu}
						aria-expanded={menuOpen}
						onclick={() => (menuOpen = !menuOpen)}><Icon name="more" size={24} stroke={3} /></button
					>
					{#if menuOpen}
						<div class="menu-panel">
							<div class="who">
								<span class="avatar"><Icon name="user" size={18} /></span>
								<span>
									<strong>{app.user?.username}</strong>
									<span class="muted role">{app.user?.role}</span>
								</span>
							</div>
							<div class="lang" role="group" aria-label={t.mapui.language}>
								<span class="eyebrow">{t.mapui.language}</span>
								<div class="segmented">
									{#each Object.entries(LANGUAGE_NAMES) as [code, label] (code)}
										<button
											lang={code}
											aria-pressed={lang === code}
											class:on={lang === code}
											onclick={() => lang !== code && setLanguage(code as Lang)}>{label}</button
										>
									{/each}
								</div>
							</div>
							<form
								method="POST"
								action="/logout"
								onsubmit={() => void app.db.meta.bulkDelete(['user', 'csrf'])}
							>
								<button class="btn wide"><Icon name="logout" size={20} />{t.nav.logout}</button>
							</form>
						</div>
					{/if}
				</div>
			</div>
		</header>

		{#if applyUpdate}
			<div class="update" role="status">
				<span>{t.mapui.updateReady}</span>
				<button class="btn primary sm" onclick={() => applyUpdate?.()}>{t.mapui.updateNow}</button>
			</div>
		{/if}

		{#if showStorageWarn}
			<div class="storage-warn" role="alert">
				<div>
					<strong>{t.mapui.storage.warnTitle}</strong>
					<span>{t.mapui.storage.warnText} {installHow}</span>
				</div>
				<button class="btn ghost sm" onclick={dismissWarn} aria-label={t.mapui.storage.dismiss}>
					<Icon name="close" size={20} />
				</button>
			</div>
		{/if}

		<main>{@render children()}</main>

		<nav class="tabs bottom" aria-label={t.nav.main}>
			{#each tabs as l (l.href)}
				<a
					href={l.href}
					class:active={current(l.href)}
					aria-current={current(l.href) ? 'page' : undefined}
				>
					<span class="pill"><Icon name={l.icon} size={22} /></span>
					<span class="tl">{l.short ?? l.label}</span>
				</a>
			{/each}
		</nav>
	</div>
{/if}

<style>
	.splash {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 8px;
		height: 100dvh;
		color: var(--muted);
		font-weight: 600;
	}
	.shell {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}
	header {
		position: relative;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 60px;
		padding: 6px 8px 6px 14px;
		padding-top: max(6px, env(safe-area-inset-top));
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--fg);
		font-size: 1.15rem;
		font-weight: 750;
		letter-spacing: -0.01em;
		text-decoration: none;
	}
	.brand img {
		border-radius: 8px;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}
	.iconbtn {
		width: var(--tap);
		padding: 0;
		color: var(--muted);
	}
	.menu {
		position: relative;
	}
	.menu-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 30;
		width: 240px;
		padding: 12px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
	}
	.lang {
		margin: 0 2px 12px;
	}
	.lang .segmented {
		margin: 6px 0 0;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 2px 2px 12px;
	}
	.who > span:last-child {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.25;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		color: var(--primary);
		background: var(--primary-soft);
		border-radius: 50%;
	}
	.role {
		font-size: 0.85rem;
		text-transform: capitalize;
	}
	form {
		margin: 0;
	}
	.update {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 6px 8px 6px 16px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--primary);
		background: var(--primary-soft);
		border-bottom: 1px solid var(--line);
	}
	.update .sm {
		flex: none;
		min-height: 40px;
		padding: 6px 16px;
	}
	.storage-warn {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 6px 8px 16px;
		font-size: 0.88rem;
		color: #6b3a03;
		background: #fdf1df;
		border-bottom: 1px solid #f1dcb8;
	}
	.storage-warn div {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 4px;
	}
	.storage-warn .sm {
		flex: none;
		width: 44px;
		min-height: 44px;
		padding: 0;
		color: inherit;
	}
	main {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: auto;
	}

	.tabs a {
		display: flex;
		align-items: center;
		text-decoration: none;
		color: var(--muted);
		font-weight: 650;
	}
	.tabs.top {
		display: none;
	}
	.tabs.bottom {
		display: flex;
		background: var(--bg);
		border-top: 1px solid var(--line);
		padding-bottom: env(safe-area-inset-bottom);
	}
	.tabs.bottom a {
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		min-width: 0;
		min-height: 64px;
		padding: 6px 2px;
		font-size: 0.72rem;
	}
	.tl {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pill {
		display: grid;
		place-items: center;
		width: 56px;
		height: 30px;
		border-radius: 999px;
		transition: background 0.15s;
	}
	.tabs.bottom a.active {
		color: var(--primary);
	}
	.tabs.bottom a.active .pill {
		background: var(--primary-soft);
	}

	@media (min-width: 900px) {
		.tabs.bottom {
			display: none;
		}
		.tabs.top {
			display: flex;
			gap: 2px;
			margin-left: 18px;
		}
		.tabs.top a {
			gap: 8px;
			min-height: 44px;
			padding: 0 14px;
			border-radius: 10px;
		}
		.tabs.top a:hover {
			color: var(--fg);
			background: var(--surface);
		}
		.tabs.top a.active {
			color: var(--primary);
			background: var(--primary-soft);
		}
	}
</style>
