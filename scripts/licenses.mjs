#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const ALLOWED = new Set([
	'MIT',
	'MIT-0',
	'ISC',
	'BSD-2-Clause',
	'BSD-3-Clause',
	'0BSD',
	'Apache-2.0',
	'MPL-2.0',
	'BlueOak-1.0.0',
	'CC0-1.0',
	'Unlicense',
	'Python-2.0',
	'Zlib',
	'CC-BY-4.0',
	'OFL-1.1'
]);

const exceptions = {};

const ALIASES = new Map(
	Object.entries({
		'apache 2.0': 'Apache-2.0',
		'apache-2': 'Apache-2.0',
		apache2: 'Apache-2.0',
		'apache license 2.0': 'Apache-2.0',
		'apache license, version 2.0': 'Apache-2.0',
		'bsd-2': 'BSD-2-Clause',
		'bsd-3': 'BSD-3-Clause',
		'bsd-3-clause-clear': 'BSD-3-Clause-Clear',
		'mit license': 'MIT',
		'the mit license': 'MIT',
		expat: 'MIT',
		'isc license': 'ISC',
		'public domain': 'Unlicense',
		cc0: 'CC0-1.0',
		'mpl 2.0': 'MPL-2.0'
	})
);

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');

const readJson = (p) => {
	try {
		return JSON.parse(fs.readFileSync(p, 'utf8'));
	} catch {
		return null;
	}
};

function resolvePkg(name, fromDir) {
	let dir = fromDir;
	for (;;) {
		const cand = path.join(dir, 'node_modules', name);
		if (fs.existsSync(path.join(cand, 'package.json'))) return fs.realpathSync(cand);
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function closure(rootPkg, kinds) {
	const seen = new Map();
	const queue = [];
	for (const k of kinds)
		for (const name of Object.keys(rootPkg[k] ?? {}))
			queue.push([name, root, k === 'optionalDependencies']);
	while (queue.length) {
		const [name, from, optional] = queue.pop();
		const dir = resolvePkg(name, from);
		if (!dir) {
			if (!optional) missing.add(name);
			continue;
		}
		if (seen.has(dir)) continue;
		const pkg = readJson(path.join(dir, 'package.json'));
		if (!pkg) continue;
		seen.set(dir, pkg);
		for (const k of ['dependencies', 'optionalDependencies'])
			for (const dep of Object.keys(pkg[k] ?? {}))
				queue.push([dep, dir, k === 'optionalDependencies']);
	}
	return seen;
}

const missing = new Set();
const rootPkg = readJson(path.join(root, 'package.json'));
if (!rootPkg) {
	console.error('package.json not found in', root);
	process.exit(2);
}
if (!fs.existsSync(path.join(root, 'node_modules'))) {
	console.error('node_modules not found: install dependencies first.');
	process.exit(2);
}
const prod = closure(rootPkg, ['dependencies', 'optionalDependencies']);
const all = closure(rootPkg, ['dependencies', 'optionalDependencies', 'devDependencies']);

function rawLicense(pkg) {
	if (typeof pkg.license === 'string') return pkg.license;
	if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
	if (Array.isArray(pkg.licenses) && pkg.licenses.length) {
		const ids = pkg.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
		if (ids.length) return ids.length === 1 ? ids[0] : `(${ids.join(' OR ')})`;
	}
	return null;
}

function licenseFile(dir) {
	let names;
	try {
		names = fs.readdirSync(dir);
	} catch {
		return null;
	}
	const hit = names
		.filter(
			(n) =>
				/^(licen[sc]e|copying|unlicense)([-._].*)?$/i.test(n) &&
				fs.statSync(path.join(dir, n)).isFile()
		)
		.sort((a, b) => a.length - b.length)[0];
	return hit ? fs.readFileSync(path.join(dir, hit), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

function sniff(text) {
	if (!text) return null;
	if (
		/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(text) &&
		/THE SOFTWARE IS PROVIDED "AS IS"/i.test(text)
	)
		return 'MIT';
	if (/Apache License\s+Version 2\.0/i.test(text)) return 'Apache-2.0';
	if (
		/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/i.test(
			text
		)
	)
		return 'ISC';
	return null;
}

function tokenize(s) {
	return s.match(/\(|\)|[^\s()]+/g) ?? [];
}
function canon(id) {
	const k = id.replace(/\+$/, '');
	return ALIASES.get(k.toLowerCase()) ?? k;
}

function evaluate(expr) {
	const toks = tokenize(expr);
	let i = 0;
	const parseOr = () => {
		let l = parseAnd();
		while (toks[i]?.toUpperCase() === 'OR') {
			i++;
			const r = parseAnd();
			l = { ok: l.ok || r.ok, bad: l.ok || r.ok ? [] : [...l.bad, ...r.bad] };
		}
		return l;
	};
	const parseAnd = () => {
		let l = parseAtom();
		while (toks[i]?.toUpperCase() === 'AND') {
			i++;
			const r = parseAtom();
			l = { ok: l.ok && r.ok, bad: [...l.bad, ...r.bad] };
		}
		return l;
	};
	const parseAtom = () => {
		const t = toks[i++];
		if (t === '(') {
			const v = parseOr();
			if (toks[i] === ')') i++;
			return v;
		}
		if (!t) return { ok: false, bad: ['(empty)'] };
		let id = t;
		while (toks[i] && !/^(AND|OR|WITH)$/i.test(toks[i]) && toks[i] !== ')' && toks[i] !== '(')
			id += ' ' + toks[i++];
		if (toks[i]?.toUpperCase() === 'WITH') i += 2;
		const c = canon(id);
		return { ok: ALLOWED.has(c), bad: ALLOWED.has(c) ? [] : [c] };
	};
	const v = parseOr();
	if (i < toks.length) return { ok: false, bad: [expr] };
	return v;
}

const label = (pkg) => `${pkg.name}@${pkg.version}`;
const exception = (pkg) => exceptions[label(pkg)] ?? exceptions[pkg.name];

function classify(dir, pkg) {
	let lic = rawLicense(pkg);
	let detected = false;
	if (!lic || /^SEE LICEN[SC]E IN/i.test(lic) || lic.toUpperCase() === 'UNLICENSED') {
		const sniffed = lic?.toUpperCase() === 'UNLICENSED' ? null : sniff(licenseFile(dir));
		if (sniffed) {
			lic = sniffed;
			detected = true;
		}
	}
	if (!lic) return { lic: '(missing)', ok: false, bad: ['(missing)'], detected };
	const r = evaluate(lic);
	return { lic, ok: r.ok, bad: r.bad, detected };
}

const failures = [];
const rows = new Map();
for (const [dir, pkg] of all) {
	if (!pkg.name) continue;
	const c = classify(dir, pkg);
	rows.set(dir, { dir, pkg, ...c });
	const ex = exception(pkg);
	if (!c.ok && !ex) failures.push({ pkg, ...c, inProd: prod.has(dir) });
}

console.log(`Checked ${rows.size} packages (${prod.size} in the production closure).`);
for (const m of missing)
	console.warn(`warning: dependency "${m}" is not installed; it was not checked`);
for (const r of rows.values())
	if (r.detected)
		console.warn(
			`note: ${label(r.pkg)} has no licence field; detected ${r.lic} from its licence file`
		);
for (const [k, why] of Object.entries(exceptions)) console.log(`exception: ${k} - ${why}`);

if (failures.length) {
	console.error('\nLICENCE POLICY VIOLATIONS:');
	for (const f of failures.sort((a, b) => label(a.pkg).localeCompare(label(b.pkg))))
		console.error(`  ${label(f.pkg)}  ${f.lic}  [${f.inProd ? 'PRODUCTION' : 'dev only'}]`);
	console.error('\nAllowed:', [...ALLOWED].join(', '));
}

function repoUrl(pkg) {
	let r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	if (!r) return pkg.homepage ?? '';
	r = r
		.replace(/^git\+/, '')
		.replace(/^git:\/\//, 'https://')
		.replace(/\.git$/, '')
		.replace(/^ssh:\/\/git@/, 'https://');
	if (/^[\w.-]+\/[\w.-]+$/.test(r)) r = `https://github.com/${r}`;
	if (/^github:/.test(r)) r = `https://github.com/${r.slice(7)}`;
	return r;
}

function writeThirdParty() {
	const list = [...prod.entries()]
		.map(([dir, pkg]) => ({
			dir,
			pkg,
			lic: rows.get(dir)?.lic ?? rawLicense(pkg) ?? '(missing)',
			text: licenseFile(dir)
		}))
		.filter((e) => e.pkg.name)
		.sort((a, b) => label(a.pkg).localeCompare(label(b.pkg)));

	const groups = new Map();
	for (const e of list) {
		const key = e.text ?? `(no licence file shipped; declared ${e.lic})`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(e);
	}

	const out = [];
	out.push('# Third-party licences', '');
	out.push(
		'Canopy itself is MIT-licensed (see `LICENSE`). It runs entirely on the components below; nothing is fetched from third parties at runtime.',
		''
	);
	out.push(
		'Generated by `node scripts/licenses.mjs --write` from the installed production dependencies (including transitive ones; platform-specific native packages appear only for the platform that generated this file). Do not edit by hand.',
		''
	);
	out.push('## Bundled non-npm assets', '');
	out.push('| Asset | Licence | Notes |', '| --- | --- | --- |');
	out.push(
		'| Noto Sans glyph PBFs (`static/fonts/`) | SIL OFL 1.1 | Pre-built SDF glyphs from [openmaptiles/fonts](https://github.com/openmaptiles/fonts) (Noto Sans by Google). Licence text: `static/fonts/LICENSE-OFL.txt`. |'
	);
	out.push(
		'| OpenStreetMap data (in the installed `.pmtiles` archive) | ODbL 1.0 | © OpenStreetMap contributors, https://www.openstreetmap.org/copyright. Attribution must stay visible on the map. |'
	);
	out.push(
		'| Map style (`static/map/style.json`) and icons (`static/icons/`) | MIT | Authored for this project; same licence as Canopy. |'
	);
	out.push(
		'| Planetiler (build tool for tiles, not shipped) | Apache-2.0 | https://github.com/onthegomap/planetiler |'
	);
	out.push('');
	out.push(`## npm packages (${list.length})`, '');
	out.push('| Package | Version | Licence | Repository |', '| --- | --- | --- | --- |');
	for (const e of list)
		out.push(
			`| ${e.pkg.name} | ${e.pkg.version} | ${e.lic.replace(/\|/g, '/')} | ${repoUrl(e.pkg)} |`
		);
	out.push('', '## Licence texts', '');
	let n = 0;
	for (const [text, entries] of [...groups.entries()].sort(
		(a, b) => b[1].length - a[1].length || label(a[1][0].pkg).localeCompare(label(b[1][0].pkg))
	)) {
		n++;
		out.push(`### ${n}. Used by ${entries.length} package${entries.length === 1 ? '' : 's'}`, '');
		out.push(entries.map((e) => `\`${label(e.pkg)}\``).join(', '), '');
		out.push('```text', text.replace(/```/g, "'''"), '```', '');
	}
	fs.writeFileSync(path.join(root, 'THIRD_PARTY_LICENSES.md'), out.join('\n'));
	console.log(
		`Wrote THIRD_PARTY_LICENSES.md (${list.length} packages, ${groups.size} distinct licence texts).`
	);
}

if (WRITE) writeThirdParty();
process.exit(failures.length ? 1 : 0);
