import { test, expect } from './browser-fixture';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`ورود: راست‌به‌چپ و اعتبارسنجی فرم ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    // Native validation or explicit Persian application feedback must reject empty credentials.
    expect(await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#username');
      return input?.validity.valueMissing || Boolean(document.querySelector('[role="alert"]'));
    })).toBe(true);
  });
}
