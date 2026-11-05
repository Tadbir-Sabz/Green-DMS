import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseTenantClient } from '../src/database/tenant-context';
import { tenantStorage } from '../src/database/tenant-context';
import { runAsJobTenant } from '../src/database/job-context';
import { TenantAwarePool } from '../src/database/tenant-pool';

/**
 * GDM-13-01 — چرخهٔ عمرِ اتصالِ اجاره‌محور.
 *
 * این تست‌ها «خاصیتِ امنیتی» را می‌سنجند، نه فقط صدا زده شدنِ release():
 * اتصالِ آلوده (با app.company_idِ مانده) باید **نابود** شود، از استخر بیرون برود و
 * هرگز به borrower بعدی نرسد. برایِ همین استخرِ ساختگی دقیقاً همان قراردادِ
 * pg-pool را پیاده می‌کند: `release()` بدونِ خطا ⇒ بازگشت به idle؛ `release(err)` ⇒
 * حذف + نابودی (در pg-pool: `_release` → `_remove` → `client.end()`).
 */

interface FakeClient {
  id: number;
  guc: Record<string, string>;
  destroyed: boolean;
  idle: boolean;
  checkedOut: boolean;
  released: Array<Error | undefined>;
  queries: string[];
  /** پاک‌سازیِ GUC (set_config به '') شکست بخورد */
  failClear: boolean;
  /** ست‌کردنِ زمینه شکست بخورد */
  failApply: boolean;
  /** تراکنش در وضعیتِ aborted ⇒ هر پرس‌وجویی 25P02 می‌دهد */
  aborted: boolean;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  release: (err?: Error) => void;
}

class FakePool {
  readonly clients: FakeClient[] = [];
  private idle: FakeClient[] = [];
  private seq = 0;
  readonly emit = vi.fn();

  get totalCount(): number {
    return this.clients.filter((c) => !c.destroyed).length;
  }

  get idleCount(): number {
    return this.idle.length;
  }

  async connect(): Promise<FakeClient> {
    const client = this.idle.shift() ?? this.create();
    // pg-pool در هر checkout یک releaseِ تازه (_releaseOnce) می‌سازد؛ پس اتصالِ
    // استفادهٔ مجدد دوباره قابلِ آزادسازی است — ولی دوبار آزادسازیِ «یک» checkout خطا می‌دهد.
    client.released = [];
    client.checkedOut = true;
    client.idle = false;
    return client;
  }

  private create(): FakeClient {
    const self = this;
    const id = ++this.seq;
    const client: FakeClient = {
      id,
      guc: {},
      destroyed: false,
      idle: false,
      checkedOut: false,
      released: [],
      queries: [],
      failClear: false,
      failApply: false,
      aborted: false,
      async query(sql: string, params: unknown[] = []) {
        client.queries.push(sql);
        if (client.aborted) {
          throw Object.assign(new Error('current transaction is aborted'), { code: '25P02' });
        }
        if (sql.includes('rollback')) {
          client.aborted = false;
          return { rows: [], rowCount: 0 };
        }
        const isSet = /set_config\('app\.([a-z_]+)'/i.exec(sql);
        if (isSet) {
          const key = isSet[1];
          const value = String(params[sql.includes('app.user_id') && key === 'company_id' ? 0 : 0] ?? '');
          // applyTenant دو ست‌کنfig را در یک عبارت می‌فرستد؛ clearTenant مقدارِ خالی
          if (key === 'company_id') {
            const next = String(params[0] ?? '');
            if (next === '' && client.failClear) {
              throw Object.assign(new Error('cleanup failed'), { code: 'XX000' });
            }
            if (next !== '' && client.failApply) {
              throw Object.assign(new Error('apply failed'), { code: 'XX000' });
            }
            client.guc.company_id = next;
          } else {
            client.guc.user_id = String(params[1] ?? '');
          }
          void value;
          return { rows: [{ set_config: '', set_config: '' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release(err?: Error) {
        if (client.released.length > 0) {
          throw new Error('Release called on client which has already been released to the pool.');
        }
        client.released.push(err);
        client.checkedOut = false;
        if (err) {
          client.destroyed = true; // همان کاری که pg-pool با release(err) می‌کند
          self.idle = self.idle.filter((c) => c !== client);
        } else {
          client.idle = true;
          self.idle.push(client);
        }
      },
    };
    this.clients.push(client);
    return client;
  }
}

const pool = () => new FakePool();

describe('GDM-13-01 · runAsJobTenant — چرخهٔ عمرِ اتصال', () => {
  it('حالتِ عادی: پاک‌سازی انجام می‌شود و اتصالِ «تمیز» به استخر برمی‌گردد', async () => {
    const p = pool();
    let during = '';
    await runAsJobTenant(p as never, 'co-A', async () => {
      during = p.clients[0].guc.company_id; // در طولِ شغل زمینه برقرار است
    });
    const c = p.clients[0];
    expect(during).toBe('co-A');
    expect(c.destroyed).toBe(false);
    expect(c.idle).toBe(true);
    expect(p.idleCount).toBe(1);
    // borrower بعدیِ «همان» اتصال، زمینهٔ مانده نمی‌بیند
    expect(c.guc.company_id).toBe('');
  });

  it('بدنهٔ شغل که پرتاب کند هم اتصال پاک و سالم به استخر برمی‌گردد', async () => {
    const p = pool();
    await expect(
      runAsJobTenant(p as never, 'co-A', async () => {
        throw new Error('job-boom');
      }),
    ).rejects.toThrow('job-boom');
    const c = p.clients[0];
    expect(c.destroyed).toBe(false);
    expect(c.idle).toBe(true);
    expect(c.guc.company_id).toBe('');
  });

  it('شکستِ پاک‌سازی ⇒ اتصال نابود می‌شود و به استخر برنمی‌گردد', async () => {
    const p = pool();
    const onConnectionDiscarded = vi.fn();
    await runAsJobTenant(
      p as never,
      'co-A',
      async () => {
        p.clients[0].failClear = true;
      },
      { onConnectionDiscarded },
    );
    const c = p.clients[0];
    expect(c.destroyed).toBe(true);
    expect(c.idle).toBe(false);
    expect(p.idleCount).toBe(0);
    expect(p.totalCount).toBe(0);
    expect(c.released).toHaveLength(1);
    expect(c.released[0]).toBeInstanceOf(Error); // release(err) ⇒ نابودی در pg
    expect(onConnectionDiscarded).toHaveBeenCalledTimes(1);
    expect(onConnectionDiscarded.mock.calls[0][0]).toMatchObject({
      companyId: 'co-A',
      stage: 'clear',
      destroyed: true,
    });
  });

  it('پاک‌سازیِ ناموفق رویِ تراکنشِ aborted هم اتصال را نابود می‌کند (25P02)', async () => {
    const p = pool();
    await runAsJobTenant(p as never, 'co-A', async () => {
      p.clients[0].aborted = true; // «current transaction is aborted» ⇒ clearTenant شکست می‌خورد
    });
    const c = p.clients[0];
    expect(c.destroyed).toBe(true);
    expect(c.idle).toBe(false);
    expect(c.released[0]).toBeInstanceOf(Error);
    expect((c.released[0] as { code?: string }).code).toBe('25P02');
  });

  it('شکستِ applyTenant ⇒ خطا منتشر می‌شود و اتصالِ checkout‌شده نشت نمی‌کند', async () => {
    const p = pool();
    await expect(
      runAsJobTenant(p as never, 'co-A', async () => undefined, {
        onConnectionDiscarded: vi.fn(),
      }),
    ).resolves.toBeUndefined();
    // سناریویِ واقعیِ شکستِ apply: کلاینت از پیش خراب است
    const broken = await p.connect();
    broken.failApply = true;
    broken.release(); // برگرداندن به idle تا runAsJobTenant همان را بگیرد
    await expect(runAsJobTenant(p as never, 'co-A', async () => undefined)).rejects.toThrow(
      'apply failed',
    );
    expect(broken.destroyed).toBe(true); // نابود، نه بازگشت به استخر
    expect(broken.checkedOut).toBe(false); // نشتِ checkout هم نداریم
    expect(p.idleCount).toBe(0);
  });

  it('⭐ اتصالِ با app.company_idِ مانده هرگز به borrower بعدی نمی‌رسد', async () => {
    const p = pool();
    let contaminated: FakeClient | undefined;
    await runAsJobTenant(p as never, 'co-SECRET', async () => {
      contaminated = p.clients[0];
      contaminated.failClear = true; // پاک‌سازی شکست می‌خورد ⇒ GUC همچنان co-SECRET است
    });
    expect(contaminated?.guc.company_id).toBe('co-SECRET'); // واقعاً آلوده ماند
    expect(contaminated?.destroyed).toBe(true);

    const next = await p.connect();
    expect(next).not.toBe(contaminated); // اتصالِ آلوده دوباره دستِ کسی نمی‌رسد
    expect(next.guc.company_id ?? '').toBe('');
    expect(next.id).toBe(2); // استخر اتصالِ تازه ساخت ⇒ بازیابیِ استخر
    expect(p.totalCount).toBe(1);
  });

  it('releaseTenantClient هرگز پرتاب نمی‌کند (خطایِ اصلیِ بدنه پوشانده نمی‌شود)', async () => {
    const p = pool();
    const c = await p.connect();
    c.failClear = true;
    const outcome = await releaseTenantClient(c, c.release.bind(c));
    expect(outcome).toMatchObject({ clean: false, destroyed: true });
    expect(outcome.error).toBeInstanceOf(Error);
    // release دوباره فراخوانی شود ⇒ همان قراردادِ pg خطا می‌دهد، ولی helper آن را می‌بلعد
    const second = await releaseTenantClient(c, c.release.bind(c));
    expect(second.destroyed).toBe(true);
  });
});

describe('GDM-13-01 · TenantAwarePool.connect — مسیرِ درخواستِ HTTP', () => {
  let inner: FakePool;
  let wrapped: TenantAwarePool;

  beforeEach(() => {
    inner = pool();
    wrapped = new TenantAwarePool(inner as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const withRequest = async <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
    tenantStorage.run({ client: (await inner.connect()) as never, tenant: { companyId, userId: 'u-1' } }, fn);

  it('releaseِ درخواست اول GUCها را پاک می‌کند و سپس اتصال به استخر برمی‌گردد', async () => {
    await withRequest('co-A', async () => {
      const client = await wrapped.connect(); // اتصالِ دومِ تراکنش در همان درخواست
      expect(client.guc.company_id).toBe('co-A'); // پیش از هر پرس‌وجویِ اجاره‌محور ست شد
      client.release();
      await Promise.resolve(); // پاک‌سازی ناهمگام است
      await new Promise((r) => setTimeout(r, 0));
      expect(client.guc.company_id).toBe('');
      expect(client.destroyed).toBe(false);
      expect(inner.idleCount).toBeGreaterThan(0);
    });
  });

  it('شکستِ پاک‌سازی در مسیرِ درخواست ⇒ اتصال نابود می‌شود و درخواستِ بعدی آلوده نمی‌شود', async () => {
    let stale: FakeClient | undefined;
    await withRequest('co-A', async () => {
      const client = await wrapped.connect();
      client.failClear = true;
      stale = client;
      client.release();
      await new Promise((r) => setTimeout(r, 5));
      expect(client.destroyed).toBe(true);
      expect(client.idle).toBe(false);
      expect(client.guc.company_id).toBe('co-A'); // آلوده ماند ⇒ پس نباید قابلِ استفادهٔ مجدد باشد
    });
    // خطایِ پاک‌سازی بلعیده نمی‌شود: رویِ کانالِ 'error'ِ خودِ pg منتشر شد
    expect(inner.emit).toHaveBeenCalled();
    expect(String(inner.emit.mock.calls.map((c) => c[1]).join('|'))).toContain('پاک‌سازیِ زمینهٔ اجاره');

    const next = await inner.connect();
    expect(next).not.toBe(stale);
    expect(next.guc.company_id ?? '').toBe('');
  });

  it('شکستِ applyTenant در connect ⇒ اتصالِ checkout‌شده نشت نمی‌کند و خطا منتشر می‌شود', async () => {
    await withRequest('co-A', async () => {
      const first = await inner.connect();
      first.failApply = true;
      first.release();
      await expect(wrapped.connect()).rejects.toThrow('apply failed');
      expect(first.destroyed).toBe(true);
      expect(first.checkedOut).toBe(false);
      expect(inner.idleCount).toBe(0);
    });
  });

  it('بدونِ زمینهٔ درخواست، رفتار دقیقاً مثلِ Pool اصلی است (سازگاریِ استخر حفظ شد)', async () => {
    const client = await wrapped.connect();
    expect(client.queries).toHaveLength(0); // هیچ set_config‌ای اجرا نشد
    client.release();
    expect(client.destroyed).toBe(false);
    expect(client.idle).toBe(true);
  });
});
