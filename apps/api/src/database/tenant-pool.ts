import type { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { applyTenant, releaseTenantClient, tenantStorage } from './tenant-context';

/**
 * لایهٔ نشست روی Pool اصلی — بدون تغییر هیچ repositoryای:
 *
 * - درخواست‌های احراز‌شده یک connection اختصاصی lease می‌کنند (TenantInterceptor)
 *   و GUCهای app.company_id/app.user_id روی همان می‌نشیند؛ این queryها به آن
 *   connection هدایت می‌شوند تا RLS (مهاجرت 0021) دقیقاً همان نشست را ببیند؛
 * - تراکنش‌ها (pool.connect) connection دوم می‌گیرند؛ GUC روی همان اعمال می‌شود
 *   و release آن همیشه ابتدا پاک‌سازی می‌کند تا به pool با نشست قبلی برنگردد؛
 * - بدون context (مانند login و health) رفتار دقیقاً مثل Pool اصلی است.
 */
export class TenantAwarePool {
  constructor(private readonly inner: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    queryTextOrConfig: string | QueryConfig,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    const store = tenantStorage.getStore();
    if (store) {
      return store.client.query<T>(
        queryTextOrConfig as never,
        values as never,
      );
    }
    return this.inner.query<T>(queryTextOrConfig as never, values as never);
  }

  async connect(): Promise<PoolClient> {
    const client = await this.inner.connect();
    // release اصلیِ pg پیش از هر patch گرفتن می‌شود (دوباره‌فراخوانی در pg-pool خطا می‌دهد)
    const originalRelease = client.release.bind(client);
    const store = tenantStorage.getStore();
    if (!store) return client;

    try {
      await applyTenant(client, store.tenant);
    } catch (err) {
      // GDM-13-01: اتصالِ checkout‌شده هرگز نباید «بدونِ آزادسازی» رها شود. مقداردهیِ
      // زمینه شکست خورده ⇒ وضعیتِ اتصال اثبات‌نشده است ⇒ نابودی، سپس انتشارِ همان خطا.
      await releaseTenantClient(
        client,
        originalRelease,
        err instanceof Error ? err : new Error(String(err)),
      );
      throw err;
    }

    // release باید اول GUCها را پاک کند؛ تا پایان پاک‌سازی به pool برنمی‌گردد
    // (درخواست بعدی همان connection را بگیرد، نشستِ بی‌نظارت نمی‌بیند).
    // اگر پاک‌سازی شکست بخورد، connection نابود می‌شود و هرگز با نشستِ مانده
    // به استخر برنمی‌گردد (خطایِ پاک‌سازی بلعیده نمی‌شود — در releaseTenantClient
    // به outcome منتقل و اینجا در رویدادِ 'release'ِ pg دیده می‌شود).
    client.release = (err?: Error): void => {
      void releaseTenantClient(client, originalRelease, err).then((outcome) => {
        if (outcome.destroyed && outcome.error && !err) {
          this.inner.emit(
            'error' as never,
            new Error(
              `پاک‌سازیِ زمینهٔ اجاره پیش از بازگشتِ اتصال ممکن نشد ⇒ اتصال نابود شد: ${String(
                (outcome.error as Error)?.message ?? outcome.error,
              )}`,
            ),
          );
        }
      });
    };
    return client;
  }

  /** برای تست‌ها و خاموش‌کردن اپ */
  end(): Promise<void> {
    return this.inner.end();
  }

  /** سایر متدهای Pool برای موارد نادر (مانند پیکربندی) عبور داده می‌شوند */
  on(event: string, listener: (...args: unknown[]) => void): Pool {
    this.inner.on(event as never, listener as never);
    return this.inner;
  }
}
