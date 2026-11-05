import { describe, expect, it, vi } from 'vitest';

/**
 * زمینهٔ اجارهٔ کارگرِ پس‌زمینه — تستِ واحدِ بدونِ DB.
 *
 * سه پرسشِ پذیرشِ TASK-12/فازِ ۲:
 *   ۱) هویتِ اجاره هرگز از payloadِ شغل گرفته نمی‌شود (دستکاریِ payload دامنه را عوض نکند)؛
 *   ۲) شغلی که اجاره‌اش قابلِ اشتقاق نیست fail-closed می‌میرد و «موفقِ بی‌صدا» نمی‌شود؛
 *   ۳) connectionِ استخر پس از هر شغل پاک‌سازی می‌شود (نشتِ زمینه بینِ شغل‌ها/درخواست‌ها)،
 *      حتی وقتی بدنهٔ شغل پرتاب می‌کند.
 */
import { JOB_USER_ID, runAsJobTenant } from '../src/database/job-context';
import { IntegrationsQueue, type ClaimedJob } from '../src/modules/integrations/queue/integrations.queue';

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
}

function fakePool(client = fakeClient(), rows: unknown[] = []) {
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
    end: vi.fn(),
    on: vi.fn(),
  };
  return { pool, client };
}

const job = (over: Partial<ClaimedJob> = {}): ClaimedJob => ({
  kind: 'psp',
  job_id: '11111111-1111-4111-8111-111111111111',
  company_id: '22222222-2222-4222-8222-222222222222',
  branch_id: '33333333-3333-4333-8333-333333333333',
  attempt_count: 0,
  payload: JSON.stringify({ branch_id: 'attacker-controlled', amount: '100', psp: 'x', terminal_id: 't' }),
  ...over,
});

describe('runAsJobTenant — برقراری و پاک‌سازیِ زمینهٔ اجاره', () => {
  it('پیش از بدنهٔ شغل، زمینه را رویِ connectionِ اختصاصی ست می‌کند', async () => {
    const { pool, client } = fakePool();
    const seen: string[] = [];
    await runAsJobTenant(pool as never, 'co-1', async () => {
      seen.push(client.query.mock.calls.map((c) => String(c[0])).join('|'));
    });
    expect(seen[0]).toContain("set_config('app.company_id'");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('app.user_id'),
      expect.any(Array),
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('شناسهٔ کاربرِ job خالی است ⇒ هیچ user_scope‌ای دامنه را گشاد نمی‌کند', async () => {
    const { pool, client } = fakePool();
    expect(JOB_USER_ID).toBe('');
    await runAsJobTenant(pool as never, 'co-1', async () => undefined);
    const params = client.query.mock.calls[0][1] as unknown[];
    expect(params).toEqual(['co-1', '']);
  });

  it('پس از پایانِ شغل، زمینه پاک می‌شود و سپس connection آزاد می‌گردد (ترتیب مهم است)', async () => {
    const { pool, client } = fakePool();
    await runAsJobTenant(pool as never, 'co-1', async () => undefined);
    const clear = client.query.mock.calls[1][0] as string;
    expect(clear).toContain("set_config('app.company_id', ''");
    expect(clear).toContain("set_config('app.user_id', ''");
    expect(client.query.mock.invocationCallOrder[1]).toBeLessThan(
      client.release.mock.invocationCallOrder[0],
    );
  });

  it('اگر بدنهٔ شغل پرتاب کند هم پاک‌سازی و آزادسازی انجام می‌شود (نشت به pool نمی‌رسد)', async () => {
    const { pool, client } = fakePool();
    await expect(
      runAsJobTenant(pool as never, 'co-1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(client.query.mock.calls[1][0]).toContain("set_config('app.company_id', ''");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('خطایِ پاک‌سازی ⇒ اتصال نابود می‌شود، نه بازگشتِ بی‌صدا به استخر (GDM-13-01)', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('clear failed')),
      release: vi.fn(),
    };
    const { pool } = fakePool(client as never);
    await runAsJobTenant(pool as never, 'co-1', async () => undefined);
    // آزادسازی دقیقاً یک بار (pg رویِ فراخوانیِ دوم خطا می‌دهد) و **با آرگومانِ خطا** ⇒
    // pg-pool کلاینت را `_remove` و `end()` می‌کند، پس اتصالِ آلوده به استخر برنمی‌گردد.
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('دو شغلِ پشتِ هم هر کدام connectionِ خودشان را می‌گیرند (اشتراکِ زمینه ممکن نیست)', async () => {
    const { pool } = fakePool();
    await runAsJobTenant(pool as never, 'co-1', async () => undefined);
    await runAsJobTenant(pool as never, 'co-2', async () => undefined);
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });
});

describe('IntegrationsQueue.processDue — هویتِ اجاره از رکوردِ پایدار، نه از payload', () => {
  it('زمینهٔ اجاره از company_idِ شغلِ claim‌شده می‌آید، حتی اگر payload شناسهٔ دیگری داشته باشد', async () => {
    const claimed = job(); // payload عمداً branch_id جعلیِ «attacker-controlled» دارد
    const { pool, client } = fakePool(fakeClient(), [claimed]);
    pool.query
      .mockResolvedValueOnce({ rows: [claimed], rowCount: 1 }) // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // settleSuccess
    const q = new IntegrationsQueue(pool as never);
    const out = await q.processDue();
    expect(out.processed).toBe(1);
    const tenantParams = client.query.mock.calls[0][1] as unknown[];
    expect(tenantParams[0]).toBe(claimed.company_id);
    expect(tenantParams[0]).not.toBe('attacker-controlled');
    // payloadِ دستکاری‌شده فقط به سرویسِ بیرونی می‌رود، هرگز به ستونِ زمینهٔ اجاره
    expect(JSON.stringify(client.query.mock.calls)).not.toContain('attacker-controlled');
  });

  it('اجارهٔ غیرقابلِ اشتقاق ⇒ شغل با دلیلِ صریح می‌میرد و هیچ کاری اجرا نمی‌شود (fail-closed)', async () => {
    const claimed = job({ company_id: null });
    const { pool } = fakePool(fakeClient(), [claimed]);
    pool.query.mockResolvedValueOnce({ rows: [claimed], rowCount: 1 });
    const q = new IntegrationsQueue(pool as never);
    const out = await q.processDue();
    expect(out.processed).toBe(1);
    const calls = pool.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('fn_job_mark_dead'))).toBe(true);
    expect(pool.query.mock.calls[1][1]).toEqual([claimed.kind, claimed.job_id, 'tenant_unresolvable']);
    // هیچ connectionی برایِ کارِ اجاره‌محور گرفته نشد ⇒ هیچ ارسال/موفقیتی ثبت نشده
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('اگر UPDATE موفقیت صفر ردیف بخورد، شغل «موفق» نمی‌شود: خطا ⇒ مسیرِ شکست/تلاشِ مجدد', async () => {
    const claimed = job();
    const { pool, client } = fakePool(fakeClient(), [claimed]);
    pool.query.mockResolvedValueOnce({ rows: [claimed], rowCount: 1 });
    // settleSuccess با rowCount=0
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // markFailure (داخلِ زمینهٔ اجاره)
    pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const q = new IntegrationsQueue(pool as never);
    await q.processDue();
    const sql = pool.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('status = $2'); // markFailure (ثبتِ تلاش/عقب‌گرد) اجرا شد
    expect(sql).toContain('attempt_count = $3');
    expect(sql).not.toContain("set status = 'success'");
    expect(client.query).toHaveBeenCalled();
  });

  it('شکستِ سرویسِ بیرونی هم داخلِ زمینهٔ اجاره ثبت می‌شود (وگرنه زیرِ RLS صفر ردیف می‌خورد)', async () => {
    const claimed = job({ kind: 'moadian' });
    const { pool } = fakePool(fakeClient(), [claimed]);
    pool.query.mockResolvedValueOnce({ rows: [claimed], rowCount: 1 });
    pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const q = new IntegrationsQueue(pool as never);
    delete process.env.MOADIAN_ENDPOINT; // ⇒ sendToMoadian پرتاب می‌کند
    await q.processDue();
    const connectCalls = pool.connect.mock.calls.length;
    expect(connectCalls).toBe(2); // یکی برایِ کار، یکی برایِ ثبتِ شکست در همان زمینه
    const sql = pool.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('moadian_submission');
  });

  it('payloadِ خراب/خالی شغل را نمی‌کشاند: به‌صورتِ شیءِ خالی تفسیر و پردازش می‌شود', async () => {
    const claimed = job({ payload: 'not-json' });
    const { pool } = fakePool(fakeClient(), [claimed]);
    pool.query.mockResolvedValueOnce({ rows: [claimed], rowCount: 1 });
    pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const q = new IntegrationsQueue(pool as never);
    const out = await q.processDue();
    expect(out.processed).toBe(1);
  });

  it('claim با سقفِ دسته فراخوانی می‌شود و نتیجهٔ آن مستقیماً شمارِ پردازش است', async () => {
    const { pool } = fakePool(fakeClient(), []);
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const q = new IntegrationsQueue(pool as never);
    const out = await q.processDue();
    expect(out.processed).toBe(0);
    expect(String(pool.query.mock.calls[0][0])).toContain('fn_job_claim_integration');
    expect(pool.query.mock.calls[0][1]).toEqual([5]);
  });
});
