import { writeFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';

// Capture diagnostics without changing any business/assertion semantics.
export const test = base.extend<{ browserEvidence: void }>({
  browserEvidence: [async ({ page }, use, info) => {
    const events: Array<{ kind: string; level?: string; text?: string; path?: string; error?: string; status?: number }> = [];
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
      const screenshot = info.outputPath('browser-screen.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await info.attach('browser-screen', { path: screenshot, contentType: 'image/png' });
    }
    const diagnostics = info.outputPath('browser-events.json');
    await writeFile(diagnostics, JSON.stringify(events, null, 2));
    await info.attach('browser-events', { path: diagnostics, contentType: 'application/json' });
    // Expected negative-control 4xx responses stay in evidence, not in this list.
    // Browser execution must not pass while an app page has an uncaught error,
    // server error or failed transport. Navigation aborts are recorded but expected.
    const unexpected = events.filter(event => event.kind === 'pageerror'
      || (event.kind === 'http-error' && (event.status ?? 0) >= 500)
      || (event.kind === 'requestfailed' && event.error !== 'net::ERR_ABORTED'));
    expect(unexpected, 'unexpected browser/runtime failures; see browser-events attachment').toEqual([]);
  }, { auto: true }],
});
export { expect };
