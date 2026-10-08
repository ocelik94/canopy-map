import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseTileParams, tileService } from '#lib/server/tiles.ts';

export const GET: RequestHandler = async ({ params }) => {
	const p = parseTileParams(params.z, params.x, params.file);
	if (!p) return json({ error: 'bad_tile' }, { status: 400 });
	const r = await tileService().tile(p.z, p.x, p.y);
	switch (r.kind) {
		case 'none':
			return json({ error: 'no_tiles_installed' }, { status: 404 });
		case 'empty':
			return new Response(null, {
				status: 204,
				headers: { 'Cache-Control': 'public, max-age=86400' }
			});
		case 'unsupported':
			return json({ error: r.reason }, { status: 415 });
		case 'tile': {
			const headers: Record<string, string> = {
				'Content-Type': 'application/x-protobuf',
				'Cache-Control': 'public, max-age=86400',
				'Content-Length': String(r.data.byteLength)
			};
			if (r.encoding) headers['Content-Encoding'] = r.encoding;
			return new Response(r.data as BodyInit, { headers });
		}
	}
};
