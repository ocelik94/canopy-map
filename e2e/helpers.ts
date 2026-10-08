import { expect, type Page } from '@playwright/test';

export const ADMIN = { username: 'e2e-admin', password: 'e2e-test-password-123' };

export async function login(page: Page, creds = ADMIN) {
	await page.goto('/login');
	await page.getByLabel('Username').fill(creds.username);
	await page.getByLabel('Password').fill(creds.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('button', { name: /^(Online|Offline), / })).toBeVisible({
		timeout: 20_000
	});
}
