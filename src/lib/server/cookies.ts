import type { Cookies } from '@sveltejs/kit';
import { SESSION_COOKIE } from './auth.ts';
import { config } from './config.ts';

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: config.secureCookies,
		sameSite: 'lax',
		expires: new Date(expiresAt)
	});
}
