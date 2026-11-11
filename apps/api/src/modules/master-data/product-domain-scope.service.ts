import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Pool, QueryResultRow } from 'pg';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import { PG_POOL } from '../../database/database.module';
import type { RequestMeta } from '../../common/request-meta';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';
import { CatalogAccess } from './catalog-access.service';
import {
  DomainCatalogGate,
  DOMAIN_IDENTITY_UNRESOLVED,
  type DomainCatalogContractStatus,
} from './domain-catalog.contract';

export interface ProductDomainScope {
  product_id: string;
  /** پاسخ همیشه در سطح هویت مرکزی است، نه یک نمای دامنهای. */
  scope: 'central';
  central_status: string;
  central_status_label_fa: string;
  /** تا تصویب PM-B1..PM-B8 هیچ مقدار، عضویت یا دسترسپذیری دامنهای برگردانده نمیشود. */
  domain_context: 'unresolved';
  domain_membership: 'unresolved';
  domain_availability: 'unresolved';
  available: false;
  state: typeof DOMAIN_IDENTITY_UNRESOLVED;
  /** نشانگر صریح: وضعیت مرکزی هرگز به دسترسپذیری دامنهای تعبیر نشده است. */
  central_status_is_domain_availability: false;
  message_fa: string;
  decision_document: string;
  decision_document_url: string;
  owner_decisions: DomainCatalogContractStatus['owner_decisions'];
}

const CENTRAL_STATUS_LABEL_FA: Record<string, string> = {
  active: 'فعال (مرکزی)',
  blocked: 'مسدود (مرکزی)',
  discontinued: 'متوقفشده (مرکزی)',
};

interface ProductStatusRow extends QueryResultRow {
  status: string;
}

/**
 * TASK-PM-02 — نمای صریح «مرز مرکزی/دامنهای» برای یک کالا.
 *
 * قابلیت خواندنی و بیداده: وجود کالای مرکزی و چرخهٔ حیات مرکزی آن را نشان
 * میدهد، ولی **هیچ** نتیجهای دربارهٔ عرضه در دامنه استنتاج نمیکند. `available`
 * همیشه `false` و سه فیلد دامنهای همیشه `unresolved`اند؛ بنابراین «فعال مرکزی»
 * به «فعال در همهٔ دامنهها» تبدیل نمیشود. هیچ جدول، مهاجرت، RLS تازه،
 * عضویت، تاریخچه یا مجوز دامنهای اضافه نشده است.
 *
 * امنیت: مجوز `master.product.view` هم در لایهٔ route و هم از پایگاهداده
 * (`CatalogAccess.assert`) بازاعتبارسنجی میشود؛ شرکت فقط از نشست میآید و
 * پرسوجو صریحاً `company_id` و `deleted_at is null` را قید میزند تا RLS
 * شرکت و عدم افشای وجود کالای شرکت دیگر حفظ شود.
 */
@Injectable()
export class ProductDomainScopeService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: CatalogAccess,
    private readonly domainGate: DomainCatalogGate,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  async getScope(
    user: AuthContext,
    productId: string,
    meta: RequestMeta,
  ): Promise<ProductDomainScope> {
    if (!isUUID(productId, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسه کالا معتبر نیست.',
      });
    }
    // Defense in depth: never trust only the controller's PermissionsGuard.
    await this.access.assert(user.companyId, user.userId, 'master.product.view');

    const { rows } = await this.pool.query<ProductStatusRow>(
      `select status from product
        where id = $1 and company_id = $2 and deleted_at is null`,
      [productId, user.companyId],
    );
    const product = rows[0];
    if (!product) {
      throw new NotFoundException({
        code: 'product_not_found',
        message_fa: 'کالا یافت نشد.',
      });
    }

    const contract = this.domainGate.status();
    await this.audit.record({
      companyId: user.companyId,
      actorUserId: user.userId,
      action: 'domain_scope_read',
      entityType: 'product',
      entityId: productId,
      after: {
        scope: 'central',
        central_status: product.status,
        state: DOMAIN_IDENTITY_UNRESOLVED,
        domain_availability: 'unresolved',
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      product_id: productId,
      scope: 'central',
      central_status: product.status,
      central_status_label_fa:
        CENTRAL_STATUS_LABEL_FA[product.status] ?? product.status,
      domain_context: 'unresolved',
      domain_membership: 'unresolved',
      domain_availability: 'unresolved',
      available: false,
      state: DOMAIN_IDENTITY_UNRESOLVED,
      central_status_is_domain_availability: false,
      message_fa:
        'وضعیت مرکزی کالا، وضعیت عرضه در دامنه نیست. تا تصویب هویت، اختیارات و ' +
        'حالتهای عضویت دامنه، هیچ دامنهای تعریف نشده و هیچ عضویت یا دسترسپذیری ' +
        'دامنهای قابل تعیین نیست؛ هیچ دادهٔ ساختگی نمایش داده نمیشود.',
      decision_document: contract.decision_document,
      decision_document_url: contract.decision_document_url,
      owner_decisions: contract.owner_decisions,
    };
  }
}
