#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const RELEASE = 'https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-sans.zip';
const LICENSE_URL = 'https://raw.githubusercontent.com/openmaptiles/fonts/master/noto-sans/LICENSE';
const STACKS = ['Noto Sans Regular', 'Noto Sans Bold'];
const RANGES = [
	'0-255',
	'256-511',
	'512-767',
	'768-1023',
	'1024-1279',
	'7680-7935',
	'7936-8191',
	'8192-8447',
	'8448-8703',
	'9472-9727'
];
const out = path.resolve('static/fonts');

function readZip(buf) {
	let eocd = buf.length - 22;
	while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
	if (eocd < 0) throw new Error('not a zip file');
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	const entries = new Map();
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
		const method = buf.readUInt16LE(p + 10);
		const csize = buf.readUInt32LE(p + 20);
		const nlen = buf.readUInt16LE(p + 28);
		const elen = buf.readUInt16LE(p + 30);
		const clen = buf.readUInt16LE(p + 32);
		const off = buf.readUInt32LE(p + 42);
		const name = buf.toString('utf8', p + 46, p + 46 + nlen);
		entries.set(name, { method, csize, off });
		p += 46 + nlen + elen + clen;
	}
	return (name) => {
		const e = entries.get(name);
		if (!e) return null;
		const start = e.off + 30 + buf.readUInt16LE(e.off + 26) + buf.readUInt16LE(e.off + 28);
		const raw = buf.subarray(start, start + e.csize);
		return e.method === 0 ? raw : zlib.inflateRawSync(raw);
	};
}

async function get(url) {
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

console.log('Downloading', RELEASE, '(~60 MB, setup time only)');
const extract = readZip(await get(RELEASE));
let n = 0;
for (const stack of STACKS) {
	fs.mkdirSync(path.join(out, stack), { recursive: true });
	for (const r of RANGES) {
		const data = extract(`${stack}/${r}.pbf`);
		if (!data) {
			console.warn(`  missing ${stack}/${r}.pbf`);
			continue;
		}
		fs.writeFileSync(path.join(out, stack, `${r}.pbf`), data);
		n++;
	}
}
fs.writeFileSync(path.join(out, 'LICENSE-OFL.txt'), await get(LICENSE_URL));
console.log(`Wrote ${n} glyph files and LICENSE-OFL.txt to static/fonts/`);
