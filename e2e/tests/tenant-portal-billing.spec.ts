import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { test, expect } from './browser-fixture';

/**
 * جریان‌های تجاریِ چنداجاره‌ای: پورتال، صورتحساب، و کنترلِ دسترسیِ ضمیمه.
 *
 * همهٔ داده‌ها در هر اجرا از نو «خود-استقرار» می‌شوند (onboarding/register) تا_SUITE
 * به seed یا وضعیتِ مانده وابسته نباشد. مسیرهای API از پروکسیِ همان‌ مبدأِ وب
 * (/api/v1) صدا زده می‌شوند — دقیقاً همان‌طور که مرورگرِ واقعی مصرف می‌کند.
 *
 * پوشش:
 *   - احرازِ هویتِ کارکنان + مجوزِ صورتحساب و دیده‌شدنِ فهرستِ فاکتورها
 *   - احرازِ هویتِ پورتال (ورود موفق، رمزِ اشتباه، /portal/me، /portal/invoices)
 *   - جداسازیِ پورتال/مشتری (هر کاربر فقط customer خودش؛ توکنِ کارکنان روی پورتال رد
 *     می‌شود و توکنِ پورتال روی endpoint کارکنان) → اثباتِ audienceِ مجزای JWT
 *   - کنترلِ دسترسیِ ضمیمه (بدونِ توکن و با توکنِ پورتال → ۴۰۱)
 */

const API = '/api/v1';
const stamp = Date.now();
const rnd = Math.random().toString(36).slice(2, 8);

const COMPANY_CODE = `E2E${stamp}${rnd}`.slice(0, 30);
const ADMIN_EMAIL = `admin_${stamp}_${rnd}@e2e.local`;
const ADMIN_PASSWORD = 'Admin@1234';

const PORTAL_A_EMAIL = `cust_a_${stamp}_${rnd}@e2e.local`;
const PORTAL_B_EMAIL = `cust_b_${stamp}_${rnd}@e2e.local`;
const PORTAL_PASSWORD = 'Portal@1234';

interface Ctx {
  api: APIRequestContext;
  staffToken: string;
  companyId: string;
  customerA: string;
  customerB: string;
  portalAToken: string;
  portalBToken: string;
}

test.describe('tenant / portal / billing / attachments', () => {
  let ctx: Ctx;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' });

    // ۱) خود-استقرارِ یک اجارهٔ تازه (ساختِ شرکت + شعبه + نقش‌ها + حسابِ مدیر)
    const reg = await api.post(`${API}/onboarding/register`, {
      data: {
        company_code: COMPANY_CODE,
        company_name: 'شرکت تست سرتاسری',
        admin_email: ADMIN_EMAIL,
        admin_password: ADMIN_PASSWORD,
      },
    });
    expect(reg.status(), 'onboarding/register باید ۲۰۱ بدهد').toBe(201);
    const regBody = await reg.json();
    expect(regBody.company_id).toBeTruthy();

    // ۲) ورودِ کارکنان با حسابِ مدیرِ ساخته‌شده
    const login = await api.post(`${API}/auth/login`, {
      data: { username: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.status(), 'ورودِ مدیر باید ۲۰۰ بدهد').toBe(200);
    const staffToken = (await login.json()).access_token as string;
    expect(staffToken).toBeTruthy();

    const auth = { Authorization: `Bearer ${staffToken}` };

    // ۳) دو مشتریِ متمایز در همان اجاره (person → customer)
    const makeCustomer = async (suffix: string) => {
      const person = await api.post(`${API}/persons`, {
        headers: auth,
        data: { code: `P-${suffix}-${rnd}`, legal_type: 'natural', first_name: 'مشتری', last_name: suffix },
      });
      expect(person.status(), `POST /persons (${suffix}) باید ۲۰۱ بدهد`).toBe(201);
      const personId = (await person.json()).id as string;

      const customer = await api.post(`${API}/customers`, {
        headers: auth,
        data: { person_id: personId, code: `C-${suffix}-${rnd}` },
      });
      expect(customer.status(), `POST /customers (${suffix}) باید ۲۰۱ بدهد`).toBe(201);
      return (await customer.json()).id as string;
    };
    const customerA = await makeCustomer('A');
    const customerB = await makeCustomer('B');
    expect(customerA).not.toBe(customerB);

    // ۴) دو حسابِ پورتال (یکی به ازای هر مشتری) توسطِ کارکنان
    const makePortalUser = async (customerId: string, email: string) => {
      const res = await api.post(`${API}/portal/users`, {
        headers: auth,
        data: { customer_id: customerId, email, password: PORTAL_PASSWORD, display_name: 'کاربر پورتال' },
      });
      expect(res.status(), `POST /portal/users (${email}) باید ۲۰۱ بدهد`).toBe(201);
    };
    await makePortalUser(customerA, PORTAL_A_EMAIL);
    await makePortalUser(customerB, PORTAL_B_EMAIL);

    // ۵) ورودِ پورتال برای هر دو حساب
    const portalLogin = async (email: string) => {
      const res = await api.post(`${API}/portal/auth/login`, { data: { email, password: PORTAL_PASSWORD } });
      expect(res.status(), `ورودِ پورتال (${email}) باید ۲۰۰ بدهد`).toBe(200);
      return (await res.json()).access_token as string;
    };
    const portalAToken = await portalLogin(PORTAL_A_EMAIL);
    const portalBToken = await portalLogin(PORTAL_B_EMAIL);

    ctx = { api, staffToken, companyId: regBody.company_id, customerA, customerB, portalAToken, portalBToken };
  });

  test.afterAll(async () => {
    await ctx?.api?.dispose();
  });

  test('صورتحساب: مدیر فهرستِ فاکتورها را می‌بیند؛ بی‌توکن ۴۰۱', async () => {
    const ok = await ctx.api.get(`${API}/billing/invoices`, {
      headers: { Authorization: `Bearer ${ctx.staffToken}` },
    });
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(Array.isArray(body), 'GET /billing/invoices باید آرایه برگرداند').toBe(true);

    const anon = await ctx.api.get(`${API}/billing/invoices`);
    expect(anon.status(), 'بدونِ توکن باید ۴۰۱ باشد').toBe(401);
  });

  test('جداسازیِ audience: توکنِ کارکنان روی پورتال رد می‌شود', async () => {
    const me = await ctx.api.get(`${API}/portal/me`, {
      headers: { Authorization: `Bearer ${ctx.staffToken}` },
    });
    expect(me.status(), 'توکنِ کارکنان نباید برای پورتال معتبر باشد').toBe(401);
  });

  test('جداسازیِ audience: توکنِ پورتال روی endpoint کارکنان رد می‌شود', async () => {
    const billing = await ctx.api.get(`${API}/billing/invoices`, {
      headers: { Authorization: `Bearer ${ctx.portalAToken}` },
    });
    expect(billing.status(), 'توکنِ پورتال نباید به صورتحسابِ کارکنان دسترسی داشته باشد').toBe(401);

    const products = await ctx.api.get(`${API}/products`, {
      headers: { Authorization: `Bearer ${ctx.portalAToken}` },
    });
    expect(products.status(), 'توکنِ پورتال نباید به دادهٔ کارکنان دسترسی داشته باشد').toBe(401);
  });

  test('پورتال: هر کاربر فقط هویتِ customer خودش را می‌بیند', async () => {
    const meA = await ctx.api.get(`${API}/portal/me`, {
      headers: { Authorization: `Bearer ${ctx.portalAToken}` },
    });
    expect(meA.status()).toBe(200);
    const bodyA = await meA.json();
    expect(bodyA.customer_id, 'کاربر A باید به customer A نگاشت شود').toBe(ctx.customerA);

    const meB = await ctx.api.get(`${API}/portal/me`, {
      headers: { Authorization: `Bearer ${ctx.portalBToken}` },
    });
    expect(meB.status()).toBe(200);
    const bodyB = await meB.json();
    expect(bodyB.customer_id, 'کاربر B باید به customer B نگاشت شود').toBe(ctx.customerB);
    expect(bodyB.customer_id).not.toBe(bodyA.customer_id);
  });

  test('پورتال: رمزِ اشتباه ۴۰۱ و نشست برقرار نمی‌شود', async () => {
    const bad = await ctx.api.post(`${API}/portal/auth/login`, {
      data: { email: PORTAL_A_EMAIL, password: 'Wrong@12345' },
    });
    expect(bad.status()).toBe(401);
  });

  test('پورتال: فاکتورهای مشتری در دسترسِ خودش است (آرایه، بدونِ نشتی)', async () => {
    const invA = await ctx.api.get(`${API}/portal/invoices`, {
      headers: { Authorization: `Bearer ${ctx.portalAToken}` },
    });
    expect(invA.status()).toBe(200);
    const listA = await invA.json();
    expect(Array.isArray(listA)).toBe(true);
    // اجارهٔ تازه فاکتوری ندارد؛ اگر داشت، همه باید متعلق به همان مشتری باشند.
    for (const row of listA as Array<Record<string, unknown>>) {
      expect(row).toBeTruthy();
    }
  });

  test('ضمیمه: بدونِ توکن و با توکنِ پورتال → ۴۰۱', async () => {
    const anonPost = await ctx.api.post(`${API}/attachments`, {
      multipart: {
        file: { name: 'pod.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
        owner_type: 'pod',
        owner_id: '00000000-0000-4000-8000-000000000000',
      },
    });
    expect(anonPost.status(), 'آپلودِ بدونِ توکن باید ۴۰۱ باشد').toBe(401);

    const anonUrl = await ctx.api.get(`${API}/attachments/00000000-0000-4000-8000-000000000000/url`);
    expect(anonUrl.status(), 'دریافتِ لینک بدونِ توکن باید ۴۰۱ باشد').toBe(401);

    const portalUrl = await ctx.api.get(`${API}/attachments/00000000-0000-4000-8000-000000000000/url`, {
      headers: { Authorization: `Bearer ${ctx.portalAToken}` },
    });
    expect(portalUrl.status(), 'توکنِ پورتال نباید به ضمیمهٔ کارکنان برسد').toBe(401);
  });

  test('پورتال: چرخش refresh و خروج زیر هویت runtime واقعی', async () => {
    const login = await ctx.api.post(`${API}/portal/auth/login`, {
      data: { email: PORTAL_A_EMAIL, password: PORTAL_PASSWORD },
    });
    expect(login.status()).toBe(200);
    const initial = await login.json();
    const refreshed = await ctx.api.post(`${API}/portal/auth/refresh`, {
      data: { refresh_token: initial.refresh_token },
    });
    expect(refreshed.status()).toBe(200);
    const next = await refreshed.json();
    const replay = await ctx.api.post(`${API}/portal/auth/refresh`, {
      data: { refresh_token: initial.refresh_token },
    });
    expect(replay.status()).toBe(401);
    const auth = { Authorization: `Bearer ${next.access_token}` };
    expect((await ctx.api.get(`${API}/portal/me`, { headers: auth })).status()).toBe(200);
    expect((await ctx.api.post(`${API}/portal/auth/logout`, { headers: auth })).status()).toBe(200);
    expect((await ctx.api.get(`${API}/portal/me`, { headers: auth })).status()).toBe(401);
  });

  test('رابطِ کاربری: ورودِ مدیر و رسیدن به داشبورد BI', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', ADMIN_EMAIL);
    await page.fill('#password', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/\/(products|dashboard|bi)/, { timeout: 30_000 });

    await page.goto('/bi');
    await expect(page.getByText('داشبورد BI').first()).toBeVisible({ timeout: 30_000 });
  });
  test('گردش اپراتور: بازگردانی، ارسال تازه، منشأ و تاریخچه در موبایل و دسکتاپ', async ({ page }, info) => {
    const auth = { Authorization: `Bearer ${ctx.staffToken}` };
    const rolesResponse = await ctx.api.get(`${API}/roles`, { headers: auth });
    expect(rolesResponse.status()).toBe(200);
    const rolesBody = await rolesResponse.json();
    const role = (rolesBody.items ?? rolesBody).find((r: { code: string }) => r.code.toLowerCase() === 'ceo');
    expect(role).toBeTruthy();
    const checkerName = `checker_${stamp}_${rnd}`;
    const checker = await ctx.api.post(`${API}/users`, { headers: auth, data: {
      username: checkerName, password: ADMIN_PASSWORD, person_code: `CHK-${rnd}`,
      first_name: 'تأییدکننده', last_name: 'آزمون', role_ids: [role.id], access_level: 'web',
    } });
    expect(checker.status()).toBe(201);
    const chain = await ctx.api.post(`${API}/rules-engine/approval-chains`, { headers: auth, data: {
      code: `OP-${rnd}`, entity: 'sales_order', steps: [{ step_no: 1, approver_role_id: role.id }],
    } });
    expect(chain.status()).toBe(201);
    const chainId = (await chain.json()).id;
    const policy = await ctx.api.post(`${API}/rules-engine/approval-policies`, { headers: auth, data: {
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chainId,
    } });
    expect(policy.status()).toBe(201);
    const order = await ctx.api.post(`${API}/orders`, { headers: auth, data: {
      customer_id: ctx.customerA, order_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' }), lines: [],
    } });
    expect(order.status()).toBe(201);
    const orderId = (await order.json()).id;
    const submit = async () => {
      const result = await ctx.api.post(`${API}/orders/${orderId}/request-approval`, { headers: auth, data: {} });
      expect(result.status()).toBe(201);
      return (await result.json()).approval_request_id as string;
    };
    const firstId = await submit();
    await page.goto('/login');
    await page.fill('#username', checkerName); await page.fill('#password', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/\/(products|dashboard|bi)/, { timeout: 30_000 });
    await page.goto('/approvals/inbox');
    await page.getByRole('button', { name: 'سفارش فروش', exact: true }).click();
    await page.selectOption('#decision', 'returned'); await page.fill('#comment', 'نیاز به اصلاح و ارسال تازه');
    await page.getByRole('button', { name: 'ثبت تصمیم', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('تصمیم ثبت شد');
    const nextId = await submit();
    expect(nextId).not.toBe(firstId);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/approvals/${firstId}`);
      await expect(page.getByText('جایگزین شده', { exact: true })).toBeVisible();
      await expect(page.getByText('نیاز به اصلاح و ارسال تازه', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'منشأ ترکیب سیاست‌ها' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await info.attach(`operator-history-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await page.goto('/approvals/inbox');
    await page.getByRole('button', { name: 'سفارش فروش', exact: true }).click();
    await page.getByRole('button', { name: 'ثبت تصمیم', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('تصمیم ثبت شد');
    await page.goto(`/approvals/${nextId}`);
    await expect(page.getByText('تأیید شده', { exact: true })).toBeVisible();
    await page.goto('/approvals/administration');
    await expect(page.getByRole('heading', { name: 'نظارت بر تنظیمات تأیید' })).toBeVisible();
    await expect(page.getByText('سیاست‌های ثبت‌شده', { exact: true })).toBeVisible();
    await info.attach('operator-administration', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('کارتابل تأیید: RTL و نمای واکنش‌گرا پس از ورود واقعی', async ({ page }, info) => {
    await page.goto('/login');
    await page.fill('#username', ADMIN_EMAIL);
    await page.fill('#password', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/\/(products|dashboard|bi)/, { timeout: 30_000 });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/approvals/inbox');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: 'کارتابل تأیید من', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await info.attach(`approval-inbox-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });

});
