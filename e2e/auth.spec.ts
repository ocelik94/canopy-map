import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test('unauthenticated users are sent to the login page', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('wrong password is rejected, correct password signs in and out', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Username').fill(ADMIN.username);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toContainText('Invalid username or password');

	await login(page);
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('English by default even on a German phone; German only when chosen', async ({ browser }) => {
	const ctx = await browser.newContext({
		locale: 'de-DE',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const page = await ctx.newPage();
	await page.goto('/login');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

	await ctx.addCookies([{ name: 'canopy_ui_lang', value: 'de', url: page.url() }]);
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
	await expect(page.getByLabel('Benutzername')).toBeVisible();
	await ctx.close();
});
