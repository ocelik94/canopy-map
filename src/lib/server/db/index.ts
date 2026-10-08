import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.ts';
import { seedDefaults } from './seed.ts';
import { config } from '../config.ts';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function openDb(file: string, migrationsDir = config.migrationsDir): Db {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsDir });
	seedDefaults(db);
	return db;
}

let instance: Db | undefined;

export function getDb(): Db {
	return (instance ??= openDb(config.databasePath));
}
