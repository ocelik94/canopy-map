<script lang="ts" module>
	const PATHS = {
		map: 'M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5v13',
		wrench:
			'M14.7 6.3a4 4 0 0 0-5.3 5.3L3.5 17.5a1.4 1.4 0 0 0 2 2l5.9-5.9a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.3-.6-.6-2.3 2.6-2.6Z',
		rotate: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
		file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h6',
		settings:
			'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
		plus: 'M12 5v14M5 12h14',
		minus: 'M5 12h14',
		locate:
			'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3m0 14v3M2 12h3m14 0h3',
		fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
		download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
		more: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
		close: 'M6 6l12 12M18 6 6 18',
		check: 'm5 12.5 4.5 4.5L19 7.5',
		search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
		filter: 'M4 6h16M7 12h10M10 18h4',
		pin: 'M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
		tap: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V10m0-.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 15a1.5 1.5 0 0 1 2.3-2L9 15',
		edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
		move: 'M12 3v18M3 12h18M12 3l-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3',
		trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
		camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
		copy: 'M9 9h10v10H9V9Zm-4 6H4V4h11v1',
		cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 10.5 3.8 3.8 0 0 0 7 18Z',
		cloudOff:
			'M7 18h10m2.6-1.6A4 4 0 0 0 17.5 10 6 6 0 0 0 9.4 5.6M6.2 8.2A6 6 0 0 0 6 10.5 3.8 3.8 0 0 0 7 18M3 3l18 18',
		sync: 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5',
		logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
		user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let {
		name,
		size = 22,
		stroke = 2
	}: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"><path d={PATHS[name]} /></svg
>

<style>
	.icon {
		display: block;
		flex: none;
	}
</style>
