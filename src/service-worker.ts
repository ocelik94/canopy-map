/// <reference lib="webworker" />
import { version, dev } from '$app/env';
import { assets, immutable } from '$app/manifest';

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const APP_CACHE = `canopy-app-${version}`;
const TILE_CACHE = 'canopy-tiles';
const TILE_CAP = 100_000;
const NAV_TIMEOUT_MS = 4000;
const SHELL = '/';

const abs = (p: string) => (p.startsWith('/') ? p : `/${p}`);
const precacheAsset = (p: string) =>
	!p.startsWith('/fonts/') || /Noto Sans (Regular|Bold)\/0-255\.pbf$/.test(p);

let firstInstall = false;

if (!dev) {
	sw.addEventListener('install', (event) => {
		firstInstall = !sw.registration.active;
		event.waitUntil(
			(async () => {
				const cache = await caches.open(APP_CACHE);
				const urls = [
					...immutable.map((f) => abs(f.path)),
					...assets.map((f) => abs(f.path)).filter(precacheAsset)
				];
				await cache.addAll(urls);
				await cacheShell(cache);
			})()
		);
	});

	sw.addEventListener('activate', (event) => {
		event.waitUntil(
			(async () => {
				for (const key of await caches.keys()) {
					if (key.startsWith('canopy-app-') && key !== APP_CACHE) await caches.delete(key);
				}
				if (firstInstall) await sw.clients.claim();
			})()
		);
	});

	sw.addEventListener('message', (event) => {
		if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
			void sw.skipWaiting().then(() => sw.clients.claim());
		}
	});

	sw.addEventListener('fetch', (event) => {
		const { request } = event;
		if (request.method !== 'GET') return;
		const url = new URL(request.url);
		if (url.origin !== sw.location.origin) return;
		const path = url.pathname;
		if (path.startsWith('/api/')) return;

		if (path.startsWith('/tiles/')) {
			if (path === '/tiles/info.json') {
				event.respondWith(
					networkFirst(request, APP_CACHE).then((res) => {
						event.waitUntil(purgeOtherTileVersions(res.clone()));
						return res;
					})
				);
			} else event.respondWith(tileHandler(request));
		} else if (path.startsWith('/_app/immutable/')) {
			event.respondWith(cacheFirst(request, APP_CACHE));
		} else if (
			path === '/map/style.json' ||
			path.startsWith('/fonts/') ||
			path.startsWith('/icons/') ||
			path === '/manifest.webmanifest'
		) {
			event.respondWith(staleWhileRevalidate(request, APP_CACHE));
		} else if (request.mode === 'navigate') {
			event.respondWith(navigation(request, url));
		}
	});
}

async function cacheShell(cache: Cache) {
	try {
		const res = await fetch(SHELL, { credentials: 'same-origin', redirect: 'manual' });
		if (res.ok) await cache.put(SHELL, res);
	} catch {}
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const hit = await cache.match(request);
	if (hit) return hit;
	const res = await fetch(request);
	if (res.ok) void cache.put(request, res.clone());
	return res;
}

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	try {
		const res = await fetch(request);
		if (res.ok) void cache.put(request, res.clone());
		return res;
	} catch (e) {
		const hit = await cache.match(request);
		if (hit) return hit;
		throw e;
	}
}

async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const hit = await cache.match(request);
	const refresh = fetch(request)
		.then((res) => {
			if (res.ok) void cache.put(request, res.clone());
			return res;
		})
		.catch(() => undefined);
	if (hit) return hit;
	const res = await refresh;
	return res ?? new Response('offline', { status: 503 });
}

function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('timeout')), ms);
		p.then(
			(r) => (clearTimeout(t), resolve(r)),
			(e) => (clearTimeout(t), reject(e))
		);
	});
}

async function navigation(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(APP_CACHE);
	try {
		const res = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
		const isPlainPage = res.ok && !res.redirected && !/^\/(login|logout)(\/|$)/.test(url.pathname);
		if (isPlainPage && (res.headers.get('content-type') ?? '').includes('text/html')) {
			void cache.put(url.pathname === SHELL ? SHELL : url.pathname + url.search, res.clone());
		}
		return res;
	} catch {
		const hit = (await cache.match(url.pathname + url.search)) ?? (await cache.match(SHELL));
		if (hit) return hit;
		return new Response('Offline. Open Canopy once while online to enable offline use.', {
			status: 503,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}
}

let tilePuts = 0;
async function tileHandler(request: Request): Promise<Response> {
	const cache = await caches.open(TILE_CACHE);
	const hit = await cache.match(request.url);
	if (hit) return hit;
	try {
		const res = await fetch(request);
		if (res.ok) {
			await cache.put(request.url, res.clone());
			if (++tilePuts % 500 === 0) void trimTiles(cache);
		}
		return res;
	} catch {
		return new Response(null, { status: 204 });
	}
}

async function purgeOtherTileVersions(info: Response) {
	try {
		const j = (await info.json()) as { installed?: boolean; version?: string };
		if (!j.installed || !j.version) return;
		const cache = await caches.open(TILE_CACHE);
		for (const req of await cache.keys()) {
			if (new URL(req.url).searchParams.get('v') !== j.version) await cache.delete(req);
		}
	} catch {}
}

async function trimTiles(cache: Cache) {
	const keys = await cache.keys();
	const extra = keys.length - TILE_CAP;
	for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}
