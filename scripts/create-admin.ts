import { createInterface } from 'node:readline/promises';
import { openDb } from '../src/lib/server/db/index.ts';
import { createUser } from '../src/lib/server/auth.ts';
import { config } from '../src/lib/server/config.ts';

const username = process.argv[2] ?? config.adminUsername;
if (!username) {
	console.error('Usage: pnpm create-admin <username>');
	process.exit(1);
}
let password = config.adminPassword;
if (!password) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	password = await rl.question('Password (min 10 chars; input is visible): ');
	rl.close();
}
const db = openDb(config.databasePath);
await createUser(db, { username, password, role: 'admin' });
console.log(`Admin "${username}" created.`);
