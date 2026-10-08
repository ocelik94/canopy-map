import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';
import {
	devicesToCsv,
	devicesToGeoJson,
	parseDeviceCsv,
	serviceLogToCsv,
	type Refs
} from './export.ts';
import type { DeviceInput } from './schemas.ts';

const refs: Refs = {
	types: [
		{ id: 'type-fixed', name: 'Fixed' },
		{ id: 'type-mobile', name: 'Mobile' }
	],
	categories: [{ id: 'cat-1', name: 'Forest', deviceTypeId: null }],
	statuses: [
		{ id: 'st-rec', name: 'Recording' },
		{ id: 'st-ret', name: 'Retrieved' }
	]
};
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const device = (o: Partial<DeviceInput> = {}): DeviceInput => ({
	id: U1,
	name: 'Rec, "One"',
	serial: 'SN1',
	deviceTypeId: 'type-mobile',
	categoryId: 'cat-1',
	statusId: 'st-rec',
	lat: 47.5,
	lon: -122.25,
	siteName: 'Ridge\nnorth',
	siteGroup: 'North',
	deployedOn: '2026-03-01',
	lastServiceOn: null,
	retrievalDueOn: '2026-09-01',
	notes: 'hello',
	createdAt: 1,
	updatedAt: 1,
	deletedAt: null,
	...o
});
const opts = { now: 1000, uuid: () => U2 };

describe('export', () => {
	it('round-trips devices through CSV', () => {
		const d = device();
		const csv = devicesToCsv([d], refs);
		const r = parseDeviceCsv(csv, refs, { ...opts, existingIds: new Set([U1]) });
		expect(r.errors).toEqual([]);
		expect(r.valid).toHaveLength(1);
		expect(r.valid[0].update).toBe(true);
		const { createdAt: _c, updatedAt: _u, ...rest } = r.valid[0].device;
		const { createdAt: _c2, updatedAt: _u2, ...orig } = d;
		expect(rest).toEqual(orig);
	});
	it('skips deleted devices on export', () => {
		expect(parseCsv(devicesToCsv([device({ deletedAt: 5 })], refs))).toHaveLength(1);
	});
	it('GeoJSON uses [lon, lat] and names', () => {
		const g = devicesToGeoJson([device()], refs);
		expect(g.type).toBe('FeatureCollection');
		expect(g.features[0].geometry.coordinates).toEqual([-122.25, 47.5]);
		expect(g.features[0].properties).toMatchObject({
			status: 'Recording',
			type: 'Mobile',
			category: 'Forest'
		});
	});
	it('protects against CSV injection and restores on import', () => {
		const d = device({ name: '=HYPERLINK("http://x")', notes: '@cmd' });
		const csv = devicesToCsv([d], refs);
		expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
		expect(csv).toContain("'@cmd");
		const r = parseDeviceCsv(csv, refs, opts);
		expect(r.valid[0].device.name).toBe(d.name);
		expect(r.valid[0].device.notes).toBe('@cmd');
	});
	it('service log rows', () => {
		const csv = serviceLogToCsv(
			[
				{
					id: U1,
					deviceId: U1,
					oldStatusId: 'st-rec',
					newStatusId: 'st-ret',
					comment: '=bad',
					createdAt: Date.UTC(2026, 0, 2),
					userId: 'u1'
				}
			],
			[device()],
			refs.statuses,
			{ u1: 'alice' }
		);
		const rows = parseCsv(csv);
		expect(rows[1]).toEqual([
			'2026-01-02T00:00:00.000Z',
			'Rec, "One"',
			'SN1',
			'Recording',
			'Retrieved',
			'alice',
			"'=bad"
		]);
	});
});

describe('parseDeviceCsv', () => {
	const header = 'name,serial,type,category,status,latitude,longitude\n';
	it('matches refs case-insensitively and generates ids', () => {
		const r = parseDeviceCsv(header + 'A,S,MOBILE,forest,recording,1.5,2.5\n', refs, opts);
		expect(r.errors).toEqual([]);
		expect(r.valid[0]).toMatchObject({ update: false });
		expect(r.valid[0].device).toMatchObject({
			id: U2,
			deviceTypeId: 'type-mobile',
			categoryId: 'cat-1',
			statusId: 'st-rec',
			lat: 1.5,
			lon: 2.5
		});
	});
	it('reports row errors with line numbers and keeps valid rows', () => {
		const text =
			header +
			'A,,Mobile,,Recording,1,2\n' +
			'B,,Nope,,Recording,1,2\n' +
			'C,,Mobile,,Gone,1,2\n' +
			'D,,Mobile,Zzz,Recording,1,2\n' +
			'E,,Mobile,,Recording,abc,2\n' +
			'F,,Mobile,,Recording,91,2\n' +
			',,Mobile,,Recording,1,2\n' +
			'\n';
		const r = parseDeviceCsv(text, refs, opts);
		expect(r.valid.map((v) => v.line)).toEqual([2]);
		expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8]);
	});
	it('rejects bad ids, duplicates, bad dates, missing columns, empty', () => {
		const h = 'id,name,type,status,latitude,longitude,deployed_on\n';
		const r = parseDeviceCsv(
			h +
				`nope,A,Mobile,Recording,1,2,\n${U1},B,Mobile,Recording,1,2,\n${U1},C,Mobile,Recording,1,2,\n${U2},D,Mobile,Recording,1,2,31/01/2026\n`,
			refs,
			opts
		);
		expect(r.valid.map((v) => v.line)).toEqual([3]);
		expect(r.errors.map((e) => e.line)).toEqual([2, 4, 5]);
		expect(parseDeviceCsv('name,type\nA,B\n', refs).errors[0].message).toMatch(/Missing column/);
		expect(parseDeviceCsv('', refs).errors).toHaveLength(1);
	});
	it('tolerates BOM and CRLF', () => {
		const r = parseDeviceCsv(
			'﻿' + header.replace('\n', '\r\n') + 'A,,Fixed,,Recording,0,0\r\n',
			refs,
			opts
		);
		expect(r.errors).toEqual([]);
		expect(r.valid).toHaveLength(1);
	});
});
