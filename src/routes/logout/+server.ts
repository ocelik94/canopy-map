import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { SESSION_COOKIE, destroySession } from '#lib/server/auth.ts';
import { logAccess } from '#lib/server/audit.ts';

export const POST: RequestHandler = ({ cookies, locals, request, getClientAddress }) => {
	const db = getDb();
	if (locals.user)
		logAccess(db, {
			event: 'logout',
			username: locals.user.username,
			userId: locals.user.id,
			ip: getClientAddress(),
			userAgent: request.headers.get('user-agent')
		});
	destroySession(db, cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
};
