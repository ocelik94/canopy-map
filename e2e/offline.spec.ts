import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('add a device while offline, then it syncs when the connection returns', async ({
	page,
	context
}) => {
	page.on('console', (m) => {
		if (m.type() === 'error' || m.type() === 'warning') console.log('[browser]', m.text());
	});
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));
	await login(page);
	const chip = page.getByRole('button', { name: /^(Online|Offline), / });
	await expect(chip).toHaveAccessibleName('Online, All saved', { timeout: 20_000 });

	await context.setOffline(true);
	await page.evaluate(() => window.dispatchEvent(new Event('offline')));

	await page.getByRole('button', { name: 'Add device', exact: false }).first().click();
	await page.getByRole('button', { name: /Add by map tap/ }).click();
	const canvas = page.locator('canvas.maplibregl-canvas');
	await canvas.click({ position: { x: 150, y: 250 } });
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E-OFFLINE-01');
	await page.getByRole('button', { name: 'Save device' }).click();

	await expect(chip).toHaveAccessibleName(/changes? waiting/);

	await page.reload();
	await expect(chip).toHaveAccessibleName(/changes? waiting/, { timeout: 20_000 });

	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(chip).toHaveAccessibleName('Online, All saved', { timeout: 30_000 });

	const res = await page.request.get('/api/sync/pull?since=0');
	const body = await res.json();
	expect(body.changes.devices.map((d: { name: string }) => d.name)).toContain('E2E-OFFLINE-01');
	expect(body.changes.locationHistory.length).toBeGreaterThan(0);
});
