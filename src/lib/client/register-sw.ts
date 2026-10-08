export interface SwOptions {
	onUpdate?: (apply: () => void) => void;
}

export async function registerServiceWorker(opts: SwOptions = {}): Promise<void> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	try {
		const reg = await navigator.serviceWorker.ready.catch(() => undefined);
		if (!reg) return;
		const offer = (worker: ServiceWorker) => {
			opts.onUpdate?.(() => {
				navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
					once: true
				});
				worker.postMessage('SKIP_WAITING');
			});
		};
		if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
		reg.addEventListener('updatefound', () => {
			const w = reg.installing;
			w?.addEventListener('statechange', () => {
				if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
			});
		});
		void reg.update().catch(() => {});
	} catch {}
}
