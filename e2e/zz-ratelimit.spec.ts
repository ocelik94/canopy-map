import { test, expect } from '@playwright/test';

test('repeated failures are rate limited', async ({ page }) => {
	await page.goto('/login');
	for (let i = 0; i < 6; i++) {
		await page.getByLabel('Username').fill('someone-else');
		await page.getByLabel('Password').fill('wrong-password-' + i);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.waitForTimeout(150);
	}
	await expect(page.getByRole('alert')).toContainText('Too many attempts');
});
