export type StorageProtection = 'persisted' | 'not-persisted' | 'unsupported';

export async function ensurePersistentStorage(): Promise<StorageProtection> {
	const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
	if (!s?.persist || !s.persisted) return 'unsupported';
	try {
		if (await s.persisted()) return 'persisted';
		return (await s.persist()) ? 'persisted' : 'not-persisted';
	} catch {
		return 'not-persisted';
	}
}

export function isInstalled(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		matchMedia('(display-mode: standalone)').matches ||
		matchMedia('(display-mode: fullscreen)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}
