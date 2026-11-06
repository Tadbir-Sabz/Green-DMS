import { defineConfig, devices } from '@playwright/test';

/**
 * پیکربندیِ Playwright برای تستِ E2E. این تست‌ها در برابرِ یک پشتهٔ کاملِ در حالِ
 * اجرا (postgres/postgis + redis + minio + api + وب) اجرا می‌شوند که در محیطِ
 * ایزولهٔ CI (workflow «e2e») با docker compose بالا می‌آید. مرورگرها در سندباکسِ
 * توسعه نصب نیستند؛ این سوئیت فقط در CI اجرا می‌شود.
 *
 * E2E_BASE_URL: نشانیِ وب (پیش‌فرض http://localhost:3000). درخواست‌های API از راهِ
 * پروکسیِ هم‌مبدأِ وب (/api/v1) می‌روند تا مسیرِ واقعیِ مرورگر→وب→api سنجیده شود.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['github']]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fa-IR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
