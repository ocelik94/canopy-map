import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) return json({ error: 'unauthenticated' }, { status: 401 });
	return json({ user: locals.user, csrfToken: locals.csrfToken });
};
