<script lang="ts">
	import { enhance } from '$app/forms';
	import { stringsFor } from '#lib/strings.ts';
	let { data, form } = $props();
	const t = $derived(stringsFor(data.lang));
</script>

<svelte:head><title>{t.login.title} · {t.appName}</title></svelte:head>

<main class="auth">
	<div class="card panel">
		<header class="brand">
			<img src="/icons/icon.svg" alt="" width="56" height="56" />
			<h1>{t.appName}</h1>
			<p>{t.tagline}</p>
		</header>
		<form method="POST" use:enhance>
			{#if form?.message}<p class="notice err" role="alert">{form.message}</p>{/if}
			<label
				>{t.login.username}
				<input name="username" autocomplete="username" required autocapitalize="none" />
			</label>
			<label
				>{t.login.password}
				<input name="password" type="password" autocomplete="current-password" required />
			</label>
			<button class="btn primary wide submit" type="submit">{t.login.submit}</button>
		</form>
	</div>
</main>

<style>
	.auth {
		display: grid;
		place-items: center;
		min-height: 100vh;
		min-height: 100dvh;
		padding: 24px 16px;
		padding-top: max(24px, env(safe-area-inset-top));
		padding-bottom: max(24px, env(safe-area-inset-bottom));
		background: var(--page);
	}
	.panel {
		width: 100%;
		max-width: 400px;
		padding: 28px 20px 24px;
		box-shadow: var(--shadow);
	}
	@media (min-width: 480px) {
		.panel {
			padding: 36px 32px 32px;
		}
	}
	.brand {
		margin-bottom: 20px;
		text-align: center;
	}
	.brand img {
		display: block;
		width: 56px;
		height: 56px;
		margin: 0 auto 12px;
		border-radius: 14px;
	}
	.brand h1 {
		margin: 0;
	}
	.brand p {
		margin: 4px 0 0;
		color: var(--muted);
	}
	.notice {
		margin: 0 0 4px;
	}
	.submit {
		margin-top: 22px;
	}
</style>
