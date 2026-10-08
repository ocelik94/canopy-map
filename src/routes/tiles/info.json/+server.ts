import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tileService } from '#lib/server/tiles.ts';

export const GET: RequestHandler = async () =>
	json(await tileService().info(), { headers: { 'Cache-Control': 'public, max-age=300' } });
