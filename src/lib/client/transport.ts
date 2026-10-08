import { AuthError, NetworkError, type Transport } from './sync.ts';
import type { MutationResult, PullResponse } from '../shared/schemas.ts';

export function httpTransport(csrf: () => string | null, f: typeof fetch = fetch): Transport {
	async function call(url: string, init?: RequestInit): Promise<Response> {
		let res: Response;
		try {
			res = await f(url, {
				...init,
				headers: { ...(init?.headers ?? {}), 'x-csrf-token': csrf() ?? '' },
				credentials: 'same-origin'
			});
		} catch {
			throw new NetworkError('offline');
		}
		if (res.status === 401 || res.status === 403) throw new AuthError('unauthenticated');
		if (res.status === 502 || res.status === 503 || res.status === 504)
			throw new NetworkError('unreachable');
		if (!res.ok) throw new Error(`Server error ${res.status}`);
		return res;
	}
	return {
		async push(mutations) {
			const res = await call('/api/sync/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mutations })
			});
			return ((await res.json()) as { results: MutationResult[] }).results;
		},
		async pull(since) {
			return (await (await call(`/api/sync/pull?since=${since}`)).json()) as PullResponse;
		},
		async uploadPhoto(p) {
			const fd = new FormData();
			fd.set('id', p.id);
			fd.set('deviceId', p.deviceId);
			fd.set('createdAt', String(p.createdAt));
			fd.set('file', p.blob, 'photo');
			await call('/api/photos', { method: 'POST', body: fd });
		},
		async health() {
			try {
				return (await f('/api/health', { cache: 'no-store' })).ok;
			} catch {
				return false;
			}
		}
	};
}
