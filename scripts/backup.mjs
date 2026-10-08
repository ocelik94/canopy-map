// Backup and restore without a shell: node scripts/backup.mjs db|photos|restore-db|restore-photos
// Archives are written to stdout and read from stdin (gzip; photos as a standard tar).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';

const DB = process.env.DATABASE_PATH ?? 'local.db';
const PHOTOS = process.env.PHOTOS_DIR ?? 'data/photos';

function checkIntegrity(file) {
	const db = new Database(file, { readonly: true });
	try {
		const result = db.pragma('integrity_check', { simple: true });
		if (result !== 'ok') throw new Error(`integrity_check failed: ${result}`);
	} finally {
		db.close();
	}
}

const removeSqliteFiles = (file, withMain) =>
	[...(withMain ? [''] : []), '-wal', '-shm'].forEach((suffix) =>
		fs.rmSync(file + suffix, { force: true })
	);

async function backupDb() {
	const tmp = path.join(os.tmpdir(), `canopy-backup-${process.pid}.db`);
	if (!fs.existsSync(DB)) throw new Error(`No database at ${DB}. Has the app been started?`);
	const src = new Database(DB, { readonly: true, fileMustExist: true });
	try {
		await src.backup(tmp);
	} finally {
		src.close();
	}
	try {
		checkIntegrity(tmp);
		await pipeline(fs.createReadStream(tmp), zlib.createGzip(), process.stdout);
	} finally {
		removeSqliteFiles(tmp, true);
	}
}

async function restoreDb() {
	const tmp = `${DB}.restore`;
	await pipeline(process.stdin, zlib.createGunzip(), fs.createWriteStream(tmp));
	try {
		checkIntegrity(tmp);
	} catch (e) {
		removeSqliteFiles(tmp, true);
		throw e;
	}
	removeSqliteFiles(tmp, false);
	removeSqliteFiles(DB, false);
	fs.renameSync(tmp, DB);
	console.error(`restored ${DB}`);
}

function tarHeader(name, size, mtime) {
	const h = Buffer.alloc(512);
	const put = (s, off, len) => h.write(s, off, len, 'utf8');
	const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
	put(name, 0, 100);
	put(oct(0o644, 8), 100, 8);
	put(oct(0, 8), 108, 8);
	put(oct(0, 8), 116, 8);
	put(oct(size, 12), 124, 12);
	put(oct(Math.floor(mtime / 1000), 12), 136, 12);
	put('        ', 148, 8);
	put('0', 156, 1);
	put('ustar\0', 257, 6);
	put('00', 263, 2);
	let sum = 0;
	for (const b of h) sum += b;
	put(oct(sum, 7) + ' ', 148, 8);
	return h;
}

async function backupPhotos() {
	const gz = zlib.createGzip();
	const done = pipeline(gz, process.stdout);
	const files = fs.existsSync(PHOTOS) ? fs.readdirSync(PHOTOS, { withFileTypes: true }) : [];
	for (const f of files) {
		if (!f.isFile()) continue;
		const file = path.join(PHOTOS, f.name);
		const data = fs.readFileSync(file);
		gz.write(tarHeader(`photos/${f.name}`, data.length, fs.statSync(file).mtimeMs));
		gz.write(data);
		gz.write(Buffer.alloc((512 - (data.length % 512)) % 512));
	}
	gz.end(Buffer.alloc(1024));
	await done;
}

async function restorePhotos() {
	fs.mkdirSync(PHOTOS, { recursive: true });
	let buf = Buffer.alloc(0);
	let count = 0;
	for await (const chunk of process.stdin.pipe(zlib.createGunzip())) {
		buf = Buffer.concat([buf, chunk]);
		while (buf.length >= 512) {
			const header = buf.subarray(0, 512);
			if (header.every((b) => b === 0)) {
				buf = buf.subarray(512);
				continue;
			}
			const size = parseInt(header.toString('utf8', 124, 136).replace(/\0.*$/, '').trim(), 8) || 0;
			const total = 512 + Math.ceil(size / 512) * 512;
			if (buf.length < total) break;
			const type = header.toString('utf8', 156, 157);
			const name = path.basename(header.toString('utf8', 0, 100).replace(/\0.*$/, ''));
			if ((type === '0' || type === '\0') && name && !name.startsWith('.')) {
				fs.writeFileSync(path.join(PHOTOS, name), buf.subarray(512, 512 + size));
				count++;
			}
			buf = buf.subarray(total);
		}
	}
	console.error(`restored ${count} photos to ${PHOTOS}`);
}

const commands = {
	db: backupDb,
	photos: backupPhotos,
	'restore-db': restoreDb,
	'restore-photos': restorePhotos
};
const run = commands[process.argv[2]];
if (!run) {
	console.error('Usage: node scripts/backup.mjs db|photos|restore-db|restore-photos');
	process.exit(1);
}
await run();
