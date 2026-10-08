<script lang="ts">
	import { t } from '#lib/strings.ts';
	import { locate } from '#lib/client/geo.ts';
	import { googleRouteLegs, orderStops, stopsFromDevices, type Leg } from '#lib/shared/route.ts';
	import Icon from './Icon.svelte';

	let { devices }: { devices: { name: string; siteName: string; lat: number; lon: number }[] } =
		$props();
	const n = t.navigate;

	const stops = $derived(stopsFromDevices(devices));
	let legs = $state<Leg[] | null>(null);
	let fromHere = $state(false);
	let busy = $state(false);

	$effect(() => {
		void devices;
		legs = null;
	});

	async function plan() {
		busy = true;
		const pos = await locate(6000);
		fromHere = pos.ok;
		legs = googleRouteLegs(orderStops(stops, pos.ok ? { lat: pos.lat, lon: pos.lon } : null));
		busy = false;
	}
</script>

{#if stops.length}
	<section class="card trip">
		<div class="head">
			<div>
				<h3>{n.routeTitle}</h3>
				<p class="muted num">{n.routeSummary(stops.length, devices.length)}</p>
			</div>
		</div>
		{#if !legs}
			<button class="btn wide" onclick={plan} disabled={busy}>
				<Icon name="map" size={20} />{busy ? n.locating : n.plan}
			</button>
		{:else}
			<p class="muted hint">{fromHere ? n.fromHere : n.noPosition}</p>
			<ol class="legs">
				{#each legs as leg, i (leg.from)}
					<li>
						<div class="lt">
							<strong class="num">{n.leg(i + 1, leg.from, leg.to)}</strong>
							<span class="stops">{leg.stops.map((s) => s.name).join(' → ')}</span>
						</div>
						<a class="btn primary" href={leg.url} target="_blank" rel="noopener noreferrer">
							<Icon name="pin" size={20} />{n.open}
						</a>
					</li>
				{/each}
			</ol>
			<p class="muted privacy">{n.privacy}</p>
		{/if}
	</section>
{/if}

<style>
	.trip {
		margin: 4px 0 16px;
	}
	h3 {
		margin: 0;
	}
	.head p {
		margin: 2px 0 12px;
		font-size: 0.9rem;
	}
	.hint,
	.privacy {
		margin: 0 0 10px;
		font-size: 0.85rem;
	}
	.privacy {
		margin: 10px 0 0;
	}
	.legs {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.legs li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
		padding: 10px 12px;
		background: var(--surface);
		border-radius: var(--radius-sm);
	}
	.lt {
		flex: 1 1 200px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stops {
		font-size: 0.9rem;
		color: var(--muted);
		overflow-wrap: break-word;
	}
</style>
