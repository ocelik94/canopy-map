import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { SESSION_COOKIE, ensureInitialAdmin, validateSession } from '#lib/server/auth.ts';
import { LANG_COOKIE, LEGACY_LANG_COOKIE, resolveLang } from '#lib/strings.ts';

export const init: ServerInit = async () => {
	await ensureInitialAdmin(getDb());
};

export const handle: Handle = async ({ event, resolve }) => {
	const db = getDb();

	const session = validateSession(db, event.cookies.get(SESSION_COOKIE));
	event.locals.user = session?.user ?? null;
	event.locals.csrfToken = session?.csrfToken ?? null;

	const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method);
	if (unsafe && event.url.pathname.startsWith('/api/') && event.url.pathname !== '/api/health') {
		if (!session || event.request.headers.get('x-csrf-token') !== session.csrfToken) {
			return json({ error: 'csrf' }, { status: 403 });
		}
	}

	const lang = resolveLang(event.cookies.get(LANG_COOKIE));
	event.locals.lang = lang;
	if (event.cookies.get(LEGACY_LANG_COOKIE))
		event.cookies.delete(LEGACY_LANG_COOKIE, { path: '/' });

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${lang}">`)
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};

export const handleError: HandleServerError = (input) => {
	if (input.kind !== 'unknown') return;
	const { error, event } = input;
	const msg = error instanceof Error ? error.message : 'unknown error';
	console.error(
		`[canopy] ${event.request.method} ${event.route.id ?? '(no route)'}: ${msg.slice(0, 200)}`
	);
	return { message: 'Internal error' };
};
