import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const DB = '/tmp/canopy-e2e.db';

export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		serviceWorkers: 'allow',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		launchOptions: {
			args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
		}
	},
	projects: [{ name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
	webServer: {
		command: `rm -f ${DB}* && pnpm build && node build`,
		url: `http://localhost:${PORT}/api/health`,
		timeout: 180_000,
		reuseExistingServer: false,
		env: {
			PORT: String(PORT),
			HOST: '127.0.0.1',
			DATABASE_PATH: DB,
			PHOTOS_DIR: '/tmp/canopy-e2e-photos',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			HOST_HEADER: 'host',
			SECURE_COOKIES: 'false',
			ADMIN_USERNAME: 'e2e-admin',
			ADMIN_PASSWORD: 'e2e-test-password-123',
			LOGIN_MAX_ATTEMPTS: '5'
		}
	}
});
