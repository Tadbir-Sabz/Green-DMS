import { test as base, expect } from '@playwright/test';

// Capture diagnostics without changing any business/assertion semantics.
export const test = base.extend<{ browserEvidence: void }>({
  browserEvidence: [async ({ page }, use, info) => {
    const events: unknown[] = [];
    const safeUrl = (url: string) => { try { return new URL(url).pathname; } catch { return '[invalid URL]'; } };
    const redact = (text: string) => text
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted JWT]');
    page.on('console', msg => events.push({ kind: 'console', level: msg.type(), text: redact(msg.text()) }));
    page.on('pageerror', error => events.push({ kind: 'pageerror', text: redact(error.message) }));
    page.on('requestfailed', req => events.push({ kind: 'requestfailed', path: safeUrl(req.url()), error: req.failure()?.errorText }));
    page.on('response', res => { if (res.status() >= 400) events.push({ kind: 'http-error', path: safeUrl(res.url()), status: res.status() }); });
    await use();
    if (!page.isClosed()) {
      await info.attach('browser-screen', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await info.attach('browser-events', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
  }, { auto: true }],
});
export { expect };
