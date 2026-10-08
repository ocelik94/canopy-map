import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import {
	authenticate,
	clearLoginFailures,
	createSession,
	loginThrottle,
	recordLoginFailure
} from '#lib/server/auth.ts';
import { setSessionCookie } from '#lib/server/cookies.ts';
import { logAccess } from '#lib/server/audit.ts';
import { stringsFor } from '#lib/strings.ts';

const schema = z.object({
	username: z.string().min(1).max(64),
	password: z.string().min(1).max(256)
});

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { lang: locals.lang };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, locals }) => {
		const t = stringsFor(locals.lang);
		const ua = request.headers.get('user-agent');
		const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { message: t.login.invalid });
		const { username, password } = parsed.data;
		const db = getDb();

		const keys = [`u:${username.toLowerCase()}`, `ip:${getClientAddress()}`];
		const wait = Math.max(...keys.map((k) => loginThrottle(db, k)));
		if (wait > 0) {
			logAccess(db, { event: 'login_throttled', username, ip: getClientAddress(), userAgent: ua });
			return fail(429, { message: t.login.throttled(wait) });
		}

		const user = await authenticate(db, username, password);
		if (!user) {
			keys.forEach((k) => recordLoginFailure(db, k));
			logAccess(db, { event: 'login_failed', username, ip: getClientAddress(), userAgent: ua });
			return fail(401, { message: t.login.invalid });
		}
		keys.forEach((k) => clearLoginFailures(db, k));
		logAccess(db, {
			event: 'login',
			username: user.username,
			userId: user.id,
			ip: getClientAddress(),
			userAgent: ua
		});
		const s = createSession(db, user.id);
		setSessionCookie(cookies, s.token, s.expiresAt);
		redirect(303, '/');
	}
};
