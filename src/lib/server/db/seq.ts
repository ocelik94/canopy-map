import { sql } from 'drizzle-orm';
import { counters } from './schema.ts';

type Runner = { insert: any; select: any; run?: any; get?: any };

export function nextSeq(tx: Runner): number {
	const row = tx
		.insert(counters)
		.values({ name: 'seq', value: 1 })
		.onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
		.returning({ value: counters.value })
		.get();
	return row.value as number;
}
