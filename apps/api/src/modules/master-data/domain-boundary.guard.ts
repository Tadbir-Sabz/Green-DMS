import {
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
import {
  DOMAIN_CONTEXT_NOT_SUPPORTED,
  DOMAIN_PROPERTY_REJECTED,
  domainBoundaryError,
  findDomainOwnedCsvHeaders,
  findDomainOwnedKeys,
} from './product-domain-boundary';

interface BoundaryRequest {
  body?: unknown;
  query?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  path?: string;
  url?: string;
  method?: string;
  ip?: string;
  auth?: AuthContext;
}

/**
 * نگهبانِ سروریشدهٔ مرز مرکزی/دامنهای (TASK-PM-02).
 *
 * گاردها پیش از pipeها اجرا میشوند؛ بنابراین ویژگی دامنهای **پیش از** آنکه
 * `ValidationPipe` با `whitelist` آن را بیصدا حذف کند دیده و صریحاً رد میشود.
 * این همان نقطهٔ خطر است: حذف بیصدای `domain_status` در بدنهٔ `POST /products`
 * به معنای «پذیرفته شد بقیهٔ درخواست» بود، یعنی ویژگی دامنهای عملاً بهعنوان
 * ویژگی سراسری کالا بیاثر/همسان فرض میشد.
 *
 * ترتیب در `@UseGuards(AuthGuard, PermissionsGuard, DomainBoundaryGuard)` اهمیت
 * دارد: فقط درخواستهای احرازشده و دارای مجوز وارد این گارد میشوند، در نتیجه
 * ممیزی ردشدنها هویت سروریشده دارد و امکان هرزنویسی با درخواست بیتوکن نیست.
 *
 * این گارد هیچ هویت دامنه، عضویت، وضعیت یا مجوز دامنهای نمیسازد و هیچ
 * `OPERATIONAL_DOMAIN_AUTHORITY` ثبت نمیکند.
 */
@Injectable()
export class DomainBoundaryGuard implements CanActivate {
  constructor(
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<BoundaryRequest>();
    const headers = req.headers ?? {};
    const rawDomainHeader = headers['x-domain-id'];
    const domainHeaderPresent =
      rawDomainHeader !== undefined &&
      rawDomainHeader !== null &&
      String(Array.isArray(rawDomainHeader) ? rawDomainHeader[0] : rawDomainHeader).trim().length > 0;

    const bodyScan = findDomainOwnedKeys(req.body);
    const queryScan = findDomainOwnedKeys(req.query);
    const bodyObject =
      typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const csvScan =
      typeof bodyObject.csv === 'string'
        ? findDomainOwnedCsvHeaders(bodyObject.csv)
        : { fields: [], bounded: false };

    const fields = [
      ...new Set([...bodyScan.fields, ...queryScan.fields, ...csvScan.fields]),
    ]
      .sort()
      .slice(0, 20);

    if (fields.length === 0 && !domainHeaderPresent) return true;

    const code = fields.length > 0 ? DOMAIN_PROPERTY_REJECTED : DOMAIN_CONTEXT_NOT_SUPPORTED;
    const source = fields.length > 0
      ? bodyScan.fields.length > 0
        ? 'body'
        : queryScan.fields.length > 0
          ? 'query'
          : 'csv_header'
      : 'x-domain-id';
    const surface = `${req.method ?? 'REQUEST'} ${req.path ?? req.url ?? ''}`;

    // ممیزی تلاش ممتاز/دامنهای: فقط نام فیلدها و مسیر، بدون مقدار و بدون
    // request_id خام کلاینت. گاردها **پیش از** TenantInterceptor اجرا میشوند،
    // پس GUCهای شرکت/کاربر روی یک اتصال اختصاصی و بهصورت transaction-local
    // ست میشوند تا RLS جدول audit_log همان نشست را ببیند. شکست ممیزی هرگز
    // تصمیم امنیتی را عوض نمیکند: حتی بدون ممیزی، درخواست fail-closed رد میشود.
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
            action: 'domain_boundary_rejected',
            entityType: 'product_catalog',
            after: {
              code,
              surface,
              source,
              fields,
              domain_header_present: domainHeaderPresent,
              owner_decisions: ['PM-B1', 'PM-B2', 'PM-B4', 'PM-B5'],
            },
            ip: req.ip ?? null,
            userAgent:
              typeof headers['user-agent'] === 'string' ? headers['user-agent'] : null,
          },
          client,
        );
      });
    } catch {
      // ممیزی تشخیصی است؛ رد کردن درخواست واجب و مستقل از آن است.
    }

    throw domainBoundaryError({ code, surface, fields, source });
  }
}
