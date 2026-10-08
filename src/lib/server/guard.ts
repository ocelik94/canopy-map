import { error } from '@sveltejs/kit';
import type { SessionUser } from './auth.ts';

export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) error(401, 'Not signed in');
	return locals.user;
}
export function requireAdmin(locals: App.Locals): SessionUser {
	const u = requireUser(locals);
	if (u.role !== 'admin') error(403, 'Admin only');
	return u;
}
