import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsQueue, type ClaimedJob } from '../src/modules/integrations/queue/integrations.queue';

/**
 * GDM-13-02 — پایدارسازیِ وضعیتِ شکستِ شغل.
 *
 * خواصِ لازم:
 *  ۱) markFailure باید «دقیقاً یک ردیف» را به‌روز کند؛
 *  ۲) صفر ردیف ⇒ خطایِ عملیاتیِ صریح + لاگ با نوعِ شغل/شناسهٔ شغل/اجاره + زمینهٔ امن؛
 *  ۳) شغلی که وضعیتِ نهایی‌اش پایدار نشد هرگز «موفق/پردازش‌شده» گزارش نمی‌شود؛
 *  ۴) کلیدِ یکتایی از رکوردِ پایدار ساخته می‌شود، نه از payload.
 */

const claimed = (over: Partial<ClaimedJob> = {}): ClaimedJob => ({
  kind: 'psp',
  job_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  company_id: 'bbbbbbbb-0000-4000-8000-000000000002',
  branch_id: 'cccccccc-0000-4000-8000-000000000003',
  attempt_count: 0,
  payload: JSON.stringify({
    branch_id: 'attacker-controlled',
    amount: '100',
    psp: 'x',
    terminal_id: 't',
    card_number: '6037-9911-2233-4455',
    api_key: 'super-secret-key',
  }),
  ...over,
});

function harness(job: ClaimedJob, opts: { failureRows?: number; failureThrows?: boolean } = {}) {
  const tenantClient = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn().mockResolvedValue(tenantClient),
    query: vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes('fn_job_claim_integration')) {
        return { rows: [job], rowCount: 1 };
      }
      if (text.includes('update psp_transaction') || text.includes('update moadian_submission')) {
        if (opts.failureThrows) throw new Error('connection lost while persisting failure');
        // UPDATE وضعیت: موفقیت یا شکست
        if (text.includes("status = 'success'")) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: opts.failureRows ?? 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: vi.fn(),
    on: vi.fn(),
  };
  const q = new IntegrationsQueue(pool as never);
  const errors: string[] = [];
  const warns: string[] = [];
  // Logger داخلی Nest را بدونِ تغییرِ کدِ منبع رهگیری می‌کنیم
  (q as unknown as { logger: { error: Function; warn: Function } }).logger = {
    error: (msg: string, ctx?: string) => errors.push(`${msg} | ${ctx ?? ''}`),
    warn: (msg: string, ctx?: string) => warns.push(`${msg} | ${ctx ?? ''}`),
    log: () => undefined,
    debug: () => undefined,
    verbose: () => undefined,
  } as never;
  return { q, pool, tenantClient, errors, warns };
}

describe('GDM-13-02 · markFailure و پایدارسازیِ وضعیت', () => {
  beforeEach(() => {
    process.env.PSP_ENDPOINT = 'https://psp.invalid/charge';
    delete process.env.MOADIAN_ENDPOINT;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('psp_unreachable')), // ⇒ مسیرِ شکست
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PSP_ENDPOINT;
  });

  it('rowCount = 1 ⇒ وضعیتِ شکست پایدار می‌شود و شغل «retrying» است (بدونِ خطایِ عملیاتی)', async () => {
    const { q, pool, errors } = harness(claimed());
    const out = await q.processDue();
    const sql = pool.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('status = $2');
    expect(sql).toContain('attempt_count = $3');
    expect(out).toEqual({ processed: 1, failed: 1, stateNotPersisted: 0 });
    expect(errors.join('\n')).not.toContain('job_state_not_persisted');
  });

  it('⭐ rowCount = 0 ⇒ خطایِ صریح، لاگِ عملیاتی و «موفقِ بی‌صدا» نداریم', async () => {
    const { q, errors } = harness(claimed(), { failureRows: 0 });
    const out = await q.processDue();
    expect(out.stateNotPersisted).toBe(1); // شغل در sending مانده ⇒ دیده می‌شود
    expect(out.failed).toBe(1);
    const log = errors.join('\n');
    expect(log).toContain('job_state_not_persisted_psp_transaction');
    // زمینهٔ لازم برایِ پیگیریِ عملیاتی
    expect(log).toContain('"job_type":"psp"');
    expect(log).toContain('"job_id":"aaaaaaaa-0000-4000-8000-000000000001"');
    expect(log).toContain('"tenant_id":"bbbbbbbb-0000-4000-8000-000000000002"');
    expect(log).toContain('"rows_updated":0');
    expect(log).toContain('"target_status":"retrying"');
  });

  it('زمینهٔ لاگ «امن» است: payload، شمارهٔ کارت و کلیدِ API هرگز لاگ نمی‌شوند', async () => {
    const { q, errors, warns } = harness(claimed(), { failureRows: 0 });
    await q.processDue();
    const all = [...errors, ...warns].join('\n');
    expect(all).not.toContain('6037-9911-2233-4455');
    expect(all).not.toContain('super-secret-key');
    expect(all).not.toContain('attacker-controlled');
  });

  it('خطایِ پایگاه‌داده هنگامِ ثبتِ شکست ⇒ همان وضعیتِ «پایدارنشده» گزارش می‌شود', async () => {
    const { q, errors } = harness(claimed(), { failureThrows: true });
    const out = await q.processDue();
    expect(out).toEqual({ processed: 1, failed: 1, stateNotPersisted: 1 });
    expect(errors.join('\n')).toContain('connection lost while persisting failure');
  });

  it('سقفِ تلاش ⇒ وضعیتِ «dead» و بدونِ next_retry_at (خروج از چرخهٔ بی‌پایان)', async () => {
    const { q, pool, warns } = harness(claimed({ attempt_count: 2 }));
    const out = await q.processDue();
    expect(out.stateNotPersisted).toBe(0);
    const update = pool.query.mock.calls.find((c) => String(c[0]).includes('attempt_count = $3'));
    expect(String(update?.[0])).toContain('next_retry_at = null');
    expect(update?.[1]).toEqual([
      'aaaaaaaa-0000-4000-8000-000000000001',
      'dead',
      3,
      expect.stringContaining('psp_unreachable'),
    ]);
    expect(warns.join('\n')).toContain('پس از 3 تلاش متوقف شد');
  });

  it('شکستِ پاک‌سازیِ زمینهٔ اجاره در میانهٔ کار ⇒ اتصال نابود + گزارش، ولی وضعیتِ شغل پایدار می‌شود', async () => {
    const { q, pool, tenantClient, warns } = harness(claimed());
    // نخستین query رویِ کلاینتِ اجاره = applyTenant؛ سپس بدنه؛ سپس clearTenant
    tenantClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // applyTenant
      .mockRejectedValueOnce(new Error('cleanup failed')); // clearTenant
    const out = await q.processDue();
    expect(tenantClient.release).toHaveBeenCalled();
    expect(tenantClient.release.mock.calls[0][0]).toBeInstanceOf(Error); // ⇒ نابودی، نه بازگشت
    expect(warns.join('\n')).toContain('پاک‌سازیِ زمینهٔ اجاره ناموفق بود');
    expect(out.stateNotPersisted).toBe(0); // مسیرِ شکست رویِ اتصالِ تازه ثبت شد
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });

  it('کلیدِ یکتایی از «رکوردِ پایدار» ساخته می‌شود، نه از payloadِ قابلِ دستکاری', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('psp_unreachable'));
    vi.stubGlobal('fetch', fetchMock);
    const { q } = harness(claimed());
    await q.processDue();
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers['idempotency-key']).toBe('psp:aaaaaaaa-0000-4000-8000-000000000001');
    expect(init.headers['idempotency-key']).not.toContain('attacker-controlled');
  });

  it('UPDATE موفقیت با صفر ردیف ⇒ شغل «موفق» گزارش نمی‌شود', async () => {
    const { q } = harness(claimed());
    // settleSuccess صفر ردیف بخورد
    (q as unknown as { settleSuccess: (j: ClaimedJob) => Promise<void> }).settleSuccess = async () => {
      throw new Error('tenant_scope_lost_psp');
    };
    const out = await q.processDue();
    expect(out.failed).toBe(1);
    expect(out.processed).toBe(1); // «برداشته‌شده» ≠ «موفق»
  });
});
