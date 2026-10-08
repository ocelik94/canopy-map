import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvRecords, safeCell, toCsv } from './csv.ts';

describe('csv', () => {
	it('parses quotes, commas, newlines, CRLF and BOM', () => {
		const text = '﻿a,b,c\r\n1,"x, y","line1\nline2"\r\n"he said ""hi""",,\r\n';
		expect(parseCsv(text)).toEqual([
			['a', 'b', 'c'],
			['1', 'x, y', 'line1\nline2'],
			['he said "hi"', '', '']
		]);
	});
	it('handles missing final newline, blank lines and empty input', () => {
		expect(parseCsv('a,b\n1,2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
		expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
		expect(parseCsv('')).toEqual([]);
	});
	it('keeps an empty quoted cell as a row', () => {
		expect(parseCsv('""\n')).toEqual([['']]);
	});
	it('serializes with escaping and round-trips', () => {
		const rows = [
			['a', 'b,c', 'd"e', 'f\ng'],
			['', '1', 'x', 'y']
		];
		const s = toCsv(rows);
		expect(s).toContain('\r\n');
		expect(parseCsv(s)).toEqual(rows);
	});
	it('neutralises formula injection but not numbers', () => {
		expect(safeCell('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(safeCell('+1')).toBe("'+1");
		expect(safeCell('-2')).toBe("'-2");
		expect(safeCell('@x')).toBe("'@x");
		expect(safeCell('ok')).toBe('ok');
		expect(toCsv([[-12.5, '=1']])).toBe("-12.5,'=1\r\n");
	});
	it('builds records with lower-cased headers and line numbers', () => {
		const r = parseCsvRecords('Name, Serial\nA,1\nB');
		expect(r.headers).toEqual(['name', 'serial']);
		expect(r.records[1]).toEqual({ line: 3, values: { name: 'B', serial: '' } });
	});
});
