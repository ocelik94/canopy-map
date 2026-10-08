<script lang="ts">
	let {
		color,
		name,
		large = false
	}: { color: string; icon?: string; name: string; large?: boolean } = $props();
</script>

<span class="badge" class:lg={large} style:--c={color} title={name}
	><span class="label">{name}</span></span
>
