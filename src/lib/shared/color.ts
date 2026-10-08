export function readableText(hex: string): '#000000' | '#ffffff' {
	const m = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!m) return '#000000';
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return L > 0.179 ? '#000000' : '#ffffff';
}
