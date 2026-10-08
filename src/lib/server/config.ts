import path from 'node:path';

const env = process.env;

export const config = {
	databasePath: env.DATABASE_PATH ?? env.DATABASE_URL ?? 'local.db',
	migrationsDir: env.MIGRATIONS_DIR ?? path.resolve('drizzle'),
	tilesDir: env.TILES_DIR ?? path.resolve('data/tiles'),
	photosDir: env.PHOTOS_DIR ?? path.resolve('data/photos'),
	secureCookies: (env.SECURE_COOKIES ?? 'true') !== 'false',
	sessionDays: Number(env.SESSION_DAYS ?? 30),
	loginMaxAttempts: Number(env.LOGIN_MAX_ATTEMPTS ?? 5),
	loginWindowMinutes: Number(env.LOGIN_WINDOW_MINUTES ?? 15),
	adminUsername: env.ADMIN_USERNAME,
	adminPassword: env.ADMIN_PASSWORD
};
