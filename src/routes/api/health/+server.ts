import { json } from '@sveltejs/kit';

export const GET = () => json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
export const HEAD = () => new Response(null, { headers: { 'cache-control': 'no-store' } });
