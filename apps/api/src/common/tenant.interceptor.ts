import { Inject, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import type { PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import type { TenantAwarePool } from '../database/tenant-pool';
import { applyTenant, clearTenant, tenantStorage } from '../database/tenant-context';

/**
 * اجارهٔ connection به ازای هر درخواست احراز‌شده — پیش‌نیاز فعال‌شدن RLS.
 *
 * ترتیب Nest: Guards (احراز هویت) → Interceptors → Handler. پس در این نقطه
 * req.auth موجود است. connection تا پایان پاسخ نگه داشته می‌شود و GUCهای
 * شرکت/کاربر فقط روی همان می‌نشیند؛ با finalize هم در پاسخ موفق و هم در خطا
 * پاک‌سازی و بازگشت به pool انجام می‌شود.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(@Inject(PG_POOL) private readonly pool: TenantAwarePool) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<{ auth?: { userId?: string; companyId?: string } }>();
    const tenant = req.auth;
    if (!tenant?.companyId || !tenant.userId) return next.handle();

    const client = await this.pool.connect();
    try {
      await applyTenant(client, { companyId: tenant.companyId, userId: tenant.userId });
    } catch (err) {
      client.release();
      throw err;
    }

    return tenantStorage.run({ client, tenant: { companyId: tenant.companyId, userId: tenant.userId } }, () =>
      next.handle().pipe(
        finalize(() => {
          void clearTenant(client)
            .catch(() => undefined)
            .finally(() => client.release());
        }),
      ),
    );
  }
}
