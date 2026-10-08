import { openDb } from '../src/lib/server/db/index.ts';
import { config } from '../src/lib/server/config.ts';

openDb(config.databasePath);
console.log('Migrations applied.');
