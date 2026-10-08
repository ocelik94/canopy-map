import { parseCsvRecords, toCsv } from './csv.ts';
import {
	deviceSchema,
	type CategoryRow,
	type DeviceInput,
	type DeviceTypeRow,
	type StatusEventInput,
	type StatusRow
} from './schemas.ts';

export interface Refs {
	types: Pick<DeviceTypeRow, 'id' | 'name'>[];
	categories: Pick<CategoryRow, 'id' | 'name' | 'deviceTypeId'>[];
	statuses: Pick<StatusRow, 'id' | 'name'>[];
}

export const DEVICE_COLUMNS = [
	'id',
	'name',
	'serial',
	'type',
	'category',
	'status',
	'latitude',
	'longitude',
	'site',
	'site_group',
	'deployed_on',
	'last_service',
	'retrieval_due',
	'notes'
] as const;

const byId = <T extends { id: string; name: string }>(xs: T[]) =>
	new Map(xs.map((x) => [x.id, x.name]));
const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);

export function devicesToCsv(devices: DeviceInput[], refs: Refs): string {
	const types = byId(refs.types);
	const cats = byId(refs.categories);
	const sts = byId(refs.statuses);
	const rows: unknown[][] = [[...DEVICE_COLUMNS]];
	for (const d of live(devices))
		rows.push([
			d.id,
			d.name,
			d.serial,
			types.get(d.deviceTypeId) ?? '',
			d.categoryId ? (cats.get(d.categoryId) ?? '') : '',
			sts.get(d.statusId) ?? '',
			d.lat,
			d.lon,
			d.siteName,
			d.siteGroup,
			d.deployedOn ?? '',
			d.lastServiceOn ?? '',
			d.retrievalDueOn ?? '',
			d.notes
		]);
	return toCsv(rows);
}

export function devicesToGeoJson(devices: DeviceInput[], refs: Refs) {
	const types = byId(refs.types);
	const cats = byId(refs.categories);
	const sts = byId(refs.statuses);
	return {
		type: 'FeatureCollection' as const,
		features: live(devices).map((d) => ({
			type: 'Feature' as const,
			geometry: { type: 'Point' as const, coordinates: [d.lon, d.lat] },
			properties: {
				id: d.id,
				name: d.name,
				serial: d.serial,
				type: types.get(d.deviceTypeId) ?? '',
				category: d.categoryId ? (cats.get(d.categoryId) ?? '') : '',
				status: sts.get(d.statusId) ?? '',
				site: d.siteName,
				site_group: d.siteGroup,
				deployed_on: d.deployedOn,
				last_service: d.lastServiceOn,
				retrieval_due: d.retrievalDueOn,
				notes: d.notes
			}
		}))
	};
}

export function serviceLogToCsv(
	events: (StatusEventInput & { userId?: string })[],
	devices: Pick<DeviceInput, 'id' | 'name' | 'serial'>[],
	statuses: Refs['statuses'],
	users: Record<string, string> = {}
): string {
	const dev = new Map(devices.map((d) => [d.id, d]));
	const sts = byId(statuses);
	const rows: unknown[][] = [
		['date', 'device', 'serial', 'old_status', 'new_status', 'user', 'comment']
	];
	for (const e of [...events].sort((a, b) => a.createdAt - b.createdAt)) {
		const d = dev.get(e.deviceId);
		rows.push([
			new Date(e.createdAt).toISOString(),
			d?.name ?? e.deviceId,
			d?.serial ?? '',
			e.oldStatusId ? (sts.get(e.oldStatusId) ?? e.oldStatusId) : '',
			sts.get(e.newStatusId) ?? e.newStatusId,
			(e.userId && users[e.userId]) || e.userId || '',
			e.comment
		]);
	}
	return toCsv(rows);
}

export interface ParsedDeviceRow {
	line: number;
	device: DeviceInput;
	update: boolean;
}
export interface ParseResult {
	valid: ParsedDeviceRow[];
	errors: { line: number; message: string }[];
}

const unquoteFormula = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDeviceCsv(
	text: string,
	refs: Refs,
	opts: { existingIds?: Set<string>; now?: number; uuid?: () => string } = {}
): ParseResult {
	const now = opts.now ?? Date.now();
	const uuid = opts.uuid ?? (() => crypto.randomUUID());
	const existing = opts.existingIds ?? new Set<string>();
	const { headers, records } = parseCsvRecords(text);
	const result: ParseResult = { valid: [], errors: [] };
	if (!headers.length) {
		result.errors.push({ line: 1, message: 'File is empty' });
		return result;
	}
	const missing = ['name', 'type', 'status', 'latitude', 'longitude'].filter(
		(h) => !headers.includes(h)
	);
	if (missing.length) {
		result.errors.push({ line: 1, message: `Missing column(s): ${missing.join(', ')}` });
		return result;
	}
	const find = <T extends { name: string }>(xs: T[], name: string) =>
		xs.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
	const seenIds = new Set<string>();

	for (const { line, values: v } of records) {
		const get = (k: string) => unquoteFormula((v[k] ?? '').trim());
		if (Object.values(v).every((x) => !x.trim())) continue;
		const err = (message: string) => result.errors.push({ line, message });

		const type = find(refs.types, get('type'));
		if (!type) {
			err(`Unknown device type "${get('type')}"`);
			continue;
		}
		const status = find(refs.statuses, get('status'));
		if (!status) {
			err(`Unknown status "${get('status')}"`);
			continue;
		}
		let categoryId: string | null = null;
		if (get('category')) {
			const cat = find(refs.categories, get('category'));
			if (!cat) {
				err(`Unknown category "${get('category')}"`);
				continue;
			}
			categoryId = cat.id;
		}
		const lat = get('latitude') === '' ? NaN : Number(get('latitude'));
		const lon = get('longitude') === '' ? NaN : Number(get('longitude'));
		if (Number.isNaN(lat) || Number.isNaN(lon)) {
			err('Latitude and longitude must be numbers');
			continue;
		}
		let id = get('id');
		if (id && !UUID.test(id)) {
			err(`Invalid id "${id}"`);
			continue;
		}
		id = id ? id.toLowerCase() : uuid();
		if (seenIds.has(id)) {
			err(`Duplicate id ${id}`);
			continue;
		}
		const parsed = deviceSchema.safeParse({
			id,
			name: get('name'),
			serial: get('serial'),
			deviceTypeId: type.id,
			categoryId,
			statusId: status.id,
			lat,
			lon,
			siteName: get('site'),
			siteGroup: get('site_group'),
			deployedOn: get('deployed_on') || null,
			lastServiceOn: get('last_service') || null,
			retrievalDueOn: get('retrieval_due') || null,
			notes: unquoteFormula(v['notes'] ?? ''),
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		});
		if (!parsed.success) {
			const i = parsed.error.issues[0];
			err(`${i.path.join('.') || 'row'}: ${i.message}`);
			continue;
		}
		seenIds.add(id);
		result.valid.push({ line, device: parsed.data, update: existing.has(id) });
	}
	return result;
}
