import type { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { applyTenant, clearTenant, tenantStorage } from './tenant-context';

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
    const store = tenantStorage.getStore();
    if (store) {
      await applyTenant(client, store.tenant);
      const originalRelease = client.release.bind(client);
      // release باید اول GUCها را پاک کند؛ تا پایان پاک‌سازی به pool برنمی‌گردد
      // (درخواست بعدی همان connection را بگیرد، نشستِ بی‌نظارت نمی‌بیند)
      client.release = (err?: Error): void => {
        void clearTenant(client)
          .catch(() => undefined)
          .finally(() => originalRelease(err));
      };
    }
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
