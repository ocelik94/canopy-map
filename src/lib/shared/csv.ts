export function parseCsv(text: string): string[][] {
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	let touched = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
			continue;
		}
		if (ch === '"' && cell === '') {
			quoted = true;
			touched = true;
		} else if (ch === ',') {
			row.push(cell);
			cell = '';
			touched = true;
		} else if (ch === '\r' || ch === '\n') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			if (touched || cell !== '') {
				row.push(cell);
				rows.push(row);
			}
			row = [];
			cell = '';
			touched = false;
		} else {
			cell += ch;
			touched = true;
		}
	}
	if (touched || cell !== '') {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

export function parseCsvRecords(text: string): {
	headers: string[];
	records: { line: number; values: Record<string, string> }[];
} {
	const rows = parseCsv(text);
	if (!rows.length) return { headers: [], records: [] };
	const headers = rows[0].map((h) => h.trim().toLowerCase());
	const records = rows.slice(1).map((r, i) => ({
		line: i + 2,
		values: Object.fromEntries(headers.map((h, j) => [h, r[j] ?? '']))
	}));
	return { headers, records };
}

export function safeCell(value: unknown): string {
	let s = value == null ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return s;
}

export function escapeCell(s: string): string {
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][], safe = true): string {
	return (
		rows
			.map((r) =>
				r
					.map((v) =>
						escapeCell(safe && typeof v !== 'number' ? safeCell(v) : v == null ? '' : String(v))
					)
					.join(',')
			)
			.join('\r\n') + '\r\n'
	);
}
