import { CatalogAccess } from './catalog-access.service';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { AuditService } from '../../common/audit.service';
import { AUDIT_SERVICE } from '../../common/audit.service';
import type { RequestMeta } from '../../common/request-meta';
import type { ProductRow } from './product.repository';
import { ProductRepository } from './product.repository';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';
import { PRODUCT_REPOSITORY } from './tokens';
import { ProductMasterRepository } from './product-master.repository';
import { detectSensitiveProductChanges, assertSensitiveConfirmed } from './product-sensitivity';
import { permissionMatches } from '../identity-rbac/permissions';

@Injectable()
export class ProductService {
  constructor(
    private readonly access: CatalogAccess,
    @Inject(PRODUCT_REPOSITORY) private readonly repo: ProductRepository,
    private readonly masterRepo: ProductMasterRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  async list(companyId: string, query: ListProductsQueryDto): Promise<Page<ProductRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسه ارسال‌شده معتبر نیست.',
      });
    }
  }

  async get(companyId: string, id: string): Promise<ProductRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
    return row;
  }

  async create(
    companyId: string,
    dto: CreateProductDto,
    actor: { userId: string; permissions: string[] },
    meta: RequestMeta,
  ): Promise<ProductRow> {
 return this.access.write(companyId, actor.userId, 'master.product.create', async () => {


    await this.assertReferences(companyId, dto);
    // D1: کدِ دستی یا تولیدِ خودکار
    let code = dto.code;
    if (!code) {
      // The company transaction lock also serializes manual writers. Skip occupied
      // generated codes rather than rejecting the first manual/automatic collision.
      for (let attempt = 0; attempt < 100; attempt++) {
        const seq = await this.masterRepo.nextCodeSeq(companyId);
        const candidate = `SKU-${String(seq).padStart(6, '0')}`;
        if (!(await this.masterRepo.productCodeExists(companyId, candidate))) { code = candidate; break; }
      }
      if (!code) throw new ConflictException({ code: 'sku_generation_conflict', message_fa: 'کد خودکار آزاد پیدا نشد؛ کد دستی وارد کنید.' });
    }
    try {
      const row = await this.repo.insert(companyId, { ...dto, code });
      await this.audit.record({
        companyId,
        actorUserId: actor.userId,
        action: 'create',
        entityType: 'product',
        entityId: row.id,
        after: { code: row.code, name: row.name, tax_code_id: row.tax_code_id, base_uom_id: row.base_uom_id },
        ip: meta.ip,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      return row;
    } catch (err) {
      throw this.mapDbError(err, 'ساخت کالا');
    }

 });
 }

  async update(
    companyId: string,
    id: string,
    dto: UpdateProductDto,
    actor: { userId: string; permissions: string[] },
    meta: RequestMeta,
  ): Promise<ProductRow> {
 return this.access.write(companyId, actor.userId, 'master.product.update', async () => {
    const servicePermissions = await this.access.assert(companyId, actor.userId, 'master.product.update');

    this.assertId(id);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) {
      throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
    }
    await this.assertReferences(companyId, dto.family_id === existing.family_id ? { ...dto, family_id: undefined } : dto);

    // D4 — نگهبانِ حساسیت در مرزِ نوشتن (همهٔ مسیرها همین service را می‌گذرانند)
    const changes = detectSensitiveProductChanges(existing, dto);
    const hasStatusPermission = servicePermissions.some((p) => permissionMatches(p, 'master.product.status'));
    assertSensitiveConfirmed(changes, dto.confirm_sensitive ?? false, hasStatusPermission, 'ویرایشِ کالا');

    // M-3 — تغییرناپذیریِ هویتِ variant پس از نخستینِ ارجاعِ عملیاتی
    const familyChanging = 'family_id' in dto && (dto.family_id ?? null) !== existing.family_id;
    if (familyChanging && (await this.masterRepo.productHasOperationalRefs(id))) {
      throw new ConflictException({
        code: 'variant_signature_immutable',
        message_fa:
          'پس از نخستین ارجاعِ عملیاتی (سند/موجودی/قیمت)، خانواده/محورهای variant تغییرناپذیرند؛ SKU جدید بسازید.',
      });
    }

    const row = await this.repo.update(companyId, id, dto, dto.row_version);
    if (!row) {
      // فقط وقتی row_version فرستاده شده به اینجا می‌رسیم
      throw new ConflictException({
        code: 'version_conflict',
        message_fa: 'کالا هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
      });
    }
    await this.audit.record({
      companyId,
      actorUserId: actor.userId,
      action: 'update',
      entityType: 'product',
      entityId: id,
      before: {
        name: existing.name,
        status: existing.status,
        tax_code_id: existing.tax_code_id,
        base_uom_id: existing.base_uom_id,
        family_id: existing.family_id,
      },
      after: {
        name: row.name,
        status: row.status,
        tax_code_id: row.tax_code_id,
        base_uom_id: row.base_uom_id,
        family_id: row.family_id,
        sensitive_changes: changes.map((c) => c.field),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;

 });
 }

  async remove(
    companyId: string,
    id: string,
    actor: { userId: string; permissions: string[] },
    meta: RequestMeta,
  ): Promise<void> {
 return this.access.write(companyId, actor.userId, 'master.product.update', async () => {
    this.assertId(id);
    const ok = await this.repo.softDelete(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
    await this.audit.record({
      companyId,
      actorUserId: actor.userId,
      action: 'delete',
      entityType: 'product',
      entityId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

 });
 }

  private async assertReferences(
    companyId: string,
    dto: CreateProductDto | UpdateProductDto,
  ): Promise<void> {
    if (dto.category_id && !(await this.repo.categoryExists(companyId, dto.category_id))) {
      throw new BadRequestException({
        code: 'invalid_category',
        message_fa: 'دسته‌بندی انتخاب‌شده برای این شرکت تعریف نشده است.',
      });
    }
    if (dto.base_uom_id && !(await this.repo.uomExists(dto.base_uom_id))) {
      throw new BadRequestException({
        code: 'invalid_uom',
        message_fa: 'واحد اندازه‌گیری انتخاب‌شده معتبر نیست.',
      });
    }
    if (dto.family_id && !(await this.masterRepo.familyExists(companyId, dto.family_id))) {
      throw new BadRequestException({
        code: 'invalid_family',
        message_fa: 'خانوادهٔ انتخاب‌شده برای این شرکت تعریف نشده است.',
      });
    }
  }

  private mapDbError(err: unknown, action: string): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_product_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد کالا قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
      });
    }
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_product_variant_signature') {
      return new ConflictException({
        code: 'duplicate_variant',
        message_fa: 'ترکیبِ صفاتِ محوری برای این خانواده قبلاً ثبت شده است (تکرارِ variant).',
      });
    }
    if (pgErr?.code === '23514') {
      return new BadRequestException({
        code: 'check_violation',
        message_fa: `شرایط کالا معتبر نیست (${pgErr.constraint}).`,
      });
    }
    if (pgErr?.code === '23503') {
      return new BadRequestException({
        code: 'invalid_reference',
        message_fa: 'یکی از مراجع (دسته‌بندی/واحد/خانواده) معتبر نیست.',
      });
    }
    return new BadRequestException({
      code: `${action}_failed`,
      message_fa: 'خطای غیرمنتظره در ذخیره کالا.',
      details: { db_code: pgErr?.code },
    });
  }
}
