import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import { PG_POOL } from '../../database/database.module';
import { withTransaction } from '../../common/transaction';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';

export const SKU_IMMUTABLE = 'code_immutable';

export const skuImmutableError = (surface: string): BadRequestException =>
  new BadRequestException({
    code: SKU_IMMUTABLE,
    message_fa:
      'کدِ SKU پس از ساختِ کالا قابلِ تغییر نیست؛ برای کالایِ جدید کدِ جدید بسازید. ' +
      'هیچ‌یک از تغییراتِ این درخواست اعمال نشد.',
    details: { field: 'code', surface },
  });

/** مسیرِ قالبِ ثابت — هرگز req.path (حاوی UUIDِ کالا) داخل ممیزی ذخیره نمی‌شود. */
const SKU_IMMUTABLE_SURFACE = 'PATCH /products/:id';

interface SkuImmutableRequest {
  body?: unknown;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
}

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-03 — تغییرناپذیریِ SKU در مسیرِ PATCH /products/:id.
 *
 * زمینه: `UpdateProductDto` به‌طورِ ارثی (PartialType از CreateProductDto) فیلدِ
 * `code` را می‌پذیرفت ولی مسیرِ `update()` هیچ اعتبارسنجی/ممیزی/نگاشت خطایی روی آن
 * نداشت — قیدِ case-sensitiveِ DB هم case-variant را بی‌صدا می‌پذیرفت (یافتهٔ F-01
 * در گزارشِ تأییدِ مستقل). تصمیم (مستندشده در گزارش تسک ۰۳): تغییرِ SKU یک
 * عملیاتِ کسب‌وکاریِ پشتیبانی‌شده نیست —
 *   - فرمِ ویرایشِ وب کد را `disabled` نشان می‌دهد («کدِ SKU پس از ثبت تغییرناپذیر است»)؛
 *   - بدنهٔ PATCH در وب هرگز `code` نمی‌فرستد؛
 *   - نگهبانِ Bulk Maintenance صراحتاً `code` را در PROTECTED_BULK_FIELDS دارد؛
 *   - هیچ اعتبارسنجی/قبل/بعد/نگاشتِ Duplicate‌ای برای تغییرِ SKU وجود ندارد.
 *
 * چون `ValidationPipe` سراسری `whitelist: true` دارد و فیلدهای ناشناس را «بی‌صدا»
 * حذف می‌کند، حذفِ صرفِ `code` از DTO کافی نیست (درخواستِ حاوی `code` بدون خطا و
 * بدون تغییر SKU عبور می‌کرد — «شکستنِ خاموش»). این گارد **پیش از** pipe اجرا می‌شود
 * و هرگونه حضورِ کلیدِ `code` در بدنهٔ JSON را با خطای روشن رد می‌کند:
 *   400 `{ code: 'code_immutable', message_fa, details: { field: 'code' } }`
 *
 * ترتیب: پس از AuthGuard/PermissionsGuard/DomainBoundaryGuard — ممیزیِ ردشدن‌ها
 * هویت سروریشده دارد و هرزه‌نوشتن با درخواستِ بی‌توکن ممکن نیست.
 * هیچ مقدار/شناسه‌ای در ممیزی ذخیره نمی‌شود؛ فقط نام فیلد و قالبِ ثابتِ مسیر
 * (`PATCH /products/:id`؛ هرگز req.path با UUIDِ کالا).
 */
@Injectable()
export class SkuImmutableGuard implements CanActivate {
  constructor(
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SkuImmutableRequest>();
    const body = req.body;
    const present =
      typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      Object.prototype.hasOwnProperty.call(body, 'code');

    if (!present) return true;

    // LOW-1 (REVIEW-01): سطحِ ردِ ممیزی همیشه قالبِ ثابتِ مسیر است — req.path هرگز
    // (چون حاوی UUIDِ کالا است) ذخیره نمی‌شود.
    const surface = SKU_IMMUTABLE_SURFACE;
    try {
      await withTransaction(this.pool, async (client) => {
        await client.query(
          `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
          [req.auth?.companyId ?? '', req.auth?.userId ?? ''],
        );
        await this.audit.recordRequired(
          {
            companyId: req.auth?.companyId ?? null,
            actorUserId: req.auth?.userId ?? null,
            action: 'sku_change_rejected',
            entityType: 'product_catalog',
            after: {
              code: SKU_IMMUTABLE,
              surface,
              fields: ['code'],
            },
            ip: req.ip ?? null,
            userAgent:
              typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null,
          },
          client,
        );
      });
    } catch {
      // ممیزی تشخیصی است؛ رد کردن درخواست واجب و مستقل از آن است.
    }

    throw skuImmutableError(surface);
  }
}
