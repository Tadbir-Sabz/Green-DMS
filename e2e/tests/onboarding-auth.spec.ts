import { request } from '@playwright/test';
import { test, expect } from './browser-fixture';

/**
 * جریانِ تجاریِ سرتاسری: خودخدمت‌دهیِ استقرارِ یک اجارهٔ تازه → ورودِ مدیر → پیمایش
 * تا داشبورد BI. این تست کلِ زنجیرهٔ واقعی را می‌سنجد:
 *   مرورگر/درخواست → وب (پروکسیِ /api/v1) → API → Postgres.
 * هیچ «ادمینِ از پیش کاشته‌شده» لازم نیست: خودِ endpoint استقرار حسابِ مدیر را
 * با هشِ واقعیِ scrypt می‌سازد، پس تست خودکفا و قابلِ تکرار است.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
const PASSWORD = 'Admin@1234';

test('استقرارِ خودخدمت → ورود → داشبورد BI', async ({ page }) => {
  const suffix = `${Date.now()}`.slice(-9);
  const companyCode = `E2E${suffix}`;
  const email = `admin_${suffix}@e2e.test`;

  // ۱) ساختِ اجارهٔ تازه و حسابِ مدیر از راهِ onboarding (عمومی، از پروکسیِ وب)
  const ctx = await request.newContext({ baseURL: API });
  const reg = await ctx.post('/onboarding/register', {
    data: {
      company_code: companyCode,
      company_name: 'شرکتِ تستِ E2E',
      admin_email: email,
      admin_password: PASSWORD,
      admin_first_name: 'مدیر',
      admin_last_name: 'تست',
    },
  });
  expect(reg.status(), 'onboarding must create the tenant (201)').toBe(201);
  const body = await reg.json();
  expect(body.company_id, 'company_id returned').toBeTruthy();
  expect(body.app_user_id, 'app_user_id returned').toBeTruthy();
  expect(body.admin_username).toBe(email);

  // ۱ب) ثبتِ مجدد با همان کدِ شرکت → 409 (قاعدهٔ تجاریِ یکتایی)
  const dup = await ctx.post('/onboarding/register', {
    data: { company_code: companyCode, company_name: 'تکراری', admin_email: `x_${suffix}@e2e.test`, admin_password: PASSWORD },
  });
  expect(dup.status(), 'duplicate company_code must conflict (409)').toBe(409);
  await ctx.dispose();

  // ۲) ورود با مدیرِ تازه از راهِ رابطِ وب
  await page.goto('/login');
  await page.fill('#username', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');

  // ۳) پس از ورودِ موفق به /products هدایت می‌شود
  await expect(page).toHaveURL(/\/products(\?.*)?$/, { timeout: 20_000 });

  // ۴) پیمایش تا داشبورد BI — مدیر (نقش ceo با '*') باید دسترسی داشته باشد
  await page.goto('/bi');
  await expect(page).toHaveURL(/\/bi(\?.*)?$/);
  await expect(page.getByText('داشبورد BI').first()).toBeVisible({ timeout: 20_000 });
});

test('ورود با رمزِ نادرست رد می‌شود', async ({ page }) => {
  const suffix = `${Date.now()}`.slice(-9);
  const email = `bad_${suffix}@e2e.test`;

  const ctx = await request.newContext({ baseURL: API });
  const reg = await ctx.post('/onboarding/register', {
    data: {
      company_code: `E2EB${suffix}`,
      company_name: 'شرکتِ تستِ ورود',
      admin_email: email,
      admin_password: PASSWORD,
    },
  });
  expect(reg.status()).toBe(201);
  await ctx.dispose();

  await page.goto('/login');
  await page.fill('#username', email);
  await page.fill('#password', 'WrongPassword!99');
  await page.click('button[type="submit"]');

  // نباید به /products برود؛ باید روی /login بماند (خطا نمایش داده می‌شود)
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});
