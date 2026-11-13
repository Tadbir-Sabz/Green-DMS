import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import { withTransaction } from '../../common/transaction';
import { tenantStorage } from '../../database/tenant-context';
import type { RequestMeta } from '../../common/request-meta';
import { permissionMatches } from '../identity-rbac/permissions';
import { ATTACHMENTS_REPOSITORY, ATTACHMENTS_SERVICE, STORAGE_SERVICE } from './tokens';
import type { AttachmentsRepository } from './attachments.repository';
import type { AttachmentView, AttachmentUrlView } from './attachments.dto';
import type { AttachmentsService, UploadedFile } from './attachments.service';
import type { StorageService } from './storage.service';
import {
  ENTITY_ATTACHMENT_LABELS_FA,
  buildEntityAttachmentView,
  findEntityOwnerFields,
  findUnsupportedBodyFields,
  isEntityAttachmentOwnerType,
  toEntityAttachmentItem,
  type EntityAttachmentItem,
  type EntityAttachmentOwnerType,
  type EntityAttachmentView,
} from './entity-attachments.rules';

export interface EntityAttachmentActor {
  companyId: string;
  userId: string;
}

/**
 * سرویس مشترک «ضمائم سازمانی» (TASK-PM-02-C3).
 *
 * ارزش افزوده نسبت به `/attachments` عمومی، **بدون** تکرار خط لولهٔ ذخیره:
 *  ۱. مالک (`owner_type` + `owner_id`) و شرکت فقط از **مسیر** و **نشست** مشتق
 *     میشوند؛ ارسال هریک از سوی کلاینت ۴۰۰ صریح میگیرد (نه حذف بیصدا).
 *  ۲. فقط هفت نوع مالک مصوبِ دارای زنجیرهٔ مالکیت راستیآزمایشده پذیرفته
 *     میشوند؛ `product` (نمای C1)، `other` و هر نوع تازهای ۴۰۰ میگیرند.
 *  ۳. همان `AttachmentsService` (سقف حجم، allowlist، امضای بایتی، SHA-256،
 *     کلید نامفضاشده، URL امضاشدهٔ کوتاهعمر، `assertOwnerInCompany`) دوباره
 *     استفاده میشود؛ هیچ کد ذخیره/مالکیت/RLS تازهای نوشته نشده است.
 *  ۴. ممیزی `audit_log` در **همان تراکنش** ثبت ردیف `attachment` انجام میشود؛
 *     شکست ممیزی ⇒ rollback + پاکسازی شیء آپلودشده (هیچ فایل بیریدیف/بیممیزی
 *     باقی نمیماند). URL امضاشده هرگز وارد `after_data` یا لاگ نمیشود.
 *  ۵. مجوزها در لایهٔ route (PermissionsGuard) و دوباره از روی DB بررسی میشوند؛
 *     RLS/FORCE RLS مهاجرت ۰۰۳۶/۰۰۴۱ و زنجیرهٔ مالکیت `ownerTenantSql`
 *     دستنخوردهاند. مجوز/نقش/grant تازهای ساخته نشده است.
 *
 * مرزها: بدون مهاجرت، بدون جدول/RLS/grant/seed تازه، بدون `domain_id`،
 * بدون حذف/بایگانی/انتخاب تصویر اصلی/سیاست نگهداشت، بدون تغییر `POST
 * /attachments` و بدون تغییر رفتار `/products/{id}/media` (C1).
 */
@Injectable()
export class EntityAttachmentsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(ATTACHMENTS_SERVICE) private readonly attachments: AttachmentsService,
    @Inject(ATTACHMENTS_REPOSITORY) private readonly attachmentRepo: AttachmentsRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** نوع مالک باید دقیقاً یکی از انواع مصوب C3 باشد؛ بقیه fail-closed رد میشوند. */
  private assertOwnerType(ownerType: string): EntityAttachmentOwnerType {
    if (!isEntityAttachmentOwnerType(ownerType)) {
      throw new BadRequestException({
        code: 'unsupported_owner_type',
        message_fa:
          'نوع موجودیت برای ضمائم سازمانی پشتیبانی نمیشود؛ تنها انواع مالک مصوب دارای زنجیرهٔ مالکیت مجازاند.',
        owner_type: ownerType,
      });
    }
    return ownerType;
  }

  private assertOwnerId(ownerId: string): void {
    if (!isUUID(ownerId, '4')) {
      throw new BadRequestException({
        code: 'invalid_owner_id',
        message_fa: 'شناسهٔ موجودیت مالک ضمیمه معتبر نیست.',
      });
    }
  }

  /**
   * بازاعتبارسنجی مجوز از روی DB (دفاع در عمق؛ گارد route تنها لایه نیست).
   * همان پرسوجوی `CatalogAccess.assert` ولی بدون قفل کاتالوگ، چون این سرویس
   * به موجودیتهای عملیاتی (فاکتور/مرجوعی/…) سرویس میدهد.
   */
  private async assertPermission(actor: EntityAttachmentActor, required: string): Promise<void> {
    const { rows } = await this.pool.query<{ code: string }>(
      `select distinct rp.permission_code as code from app_user u
         join person p on p.id = u.person_id
         join user_role ur on ur.app_user_id = u.id
         join role r on r.id = ur.role_id and r.company_id = p.company_id
         join role_permission rp on rp.role_id = r.id
        where u.id = $1 and p.company_id = $2 and not u.is_locked
          and u.access_level <> 'none' and (u.locked_until is null or u.locked_until <= now())`,
      [actor.userId, actor.companyId],
    );
    const granted = rows.map((r) => r.code);
    if (!granted.some((g) => permissionMatches(g, required))) {
      throw new ForbiddenException({
        code: 'attachment_permission_denied',
        message_fa: `مجوز «${required}» برای ضمائم این موجودیت لازم است.`,
      });
    }
  }

  /** فهرست ضمائم یک موجودیت — نمای یکسان برای همهٔ انواع واجدشرایط. */
  async list(
    actor: EntityAttachmentActor,
    ownerType: string,
    ownerId: string,
  ): Promise<EntityAttachmentView> {
    const type = this.assertOwnerType(ownerType);
    this.assertOwnerId(ownerId);
    await this.assertPermission(actor, 'attachment.view');

    // listForOwner خودش زنجیرهٔ مالکیت را در DB اثبات و URL تازه امضا میکند.
    const views: AttachmentView[] = await this.attachments.listForOwner(type, ownerId, {
      userId: actor.userId,
      companyId: actor.companyId,
    });
    return buildEntityAttachmentView(type, ownerId, views);
  }

  /** بارگذاری امن: مالک از مسیر، ممیزی تراکنشی، پاکسازی اورفان در هر شکست. */
  async upload(
    actor: EntityAttachmentActor,
    ownerType: string,
    ownerId: string,
    file: UploadedFile | undefined,
    body: unknown,
    meta: RequestMeta,
  ): Promise<EntityAttachmentItem> {
    const type = this.assertOwnerType(ownerType);
    this.assertOwnerId(ownerId);

    const ownerFields = findEntityOwnerFields(body);
    if (ownerFields.length > 0) {
      throw new BadRequestException({
        code: 'entity_attachment_owner_scope_rejected',
        message_fa:
          'مالک و شرکت ضمیمه فقط از نشست و نشانی موجودیت تعیین میشود؛ ارسال این فیلدها مجاز نیست.',
        details: { fields: ownerFields },
      });
    }
    const unsupported = findUnsupportedBodyFields(body);
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_request_field',
        message_fa: 'فیلدهای ارسالی در قرارداد ضمائم تعریف نشدهاند.',
        details: { fields: unsupported },
      });
    }

    await this.assertPermission(actor, 'attachment.upload');

    // قلابِ افزودنی AttachmentsService: کلید شیء دقیقاً پس از put در دسترس است.
    // اگر ثبت DB، صدور URL یا ممیزی شکست بخورد، همان شیء پاک میشود.
    let storageKey: string | null = null;
    try {
      return await withTransaction(this.pool, async (client: PoolClient) => {
        // GUCهای تراکنش-محلی ⇒ RLS/FORCE RLS دقیقاً همین شرکت را میبیند.
        await client.query(
          `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
          [actor.companyId, actor.userId],
        );
        return tenantStorage.run(
          { client, tenant: { companyId: actor.companyId, userId: actor.userId } },
          async () => {
            const view = await this.attachments.upload(
              file,
              { owner_type: type, owner_id: ownerId },
              { userId: actor.userId, companyId: actor.companyId },
              { onObjectStored: (key) => { storageKey = key; } },
            );

            // ممیزی fail-closed در همان تراکنش. فقط metadata؛ هرگز URL امضاشده،
            // هرگز storage_key (کلید دسترسی) و هرگز ورودی خام کلاینت.
            await this.audit.recordRequired(
              {
                companyId: actor.companyId,
                actorUserId: actor.userId,
                action: 'create',
                entityType: 'entity_attachment',
                entityId: ownerId,
                after: {
                  attachment_id: view.id,
                  owner_type: type,
                  owner_label_fa: ENTITY_ATTACHMENT_LABELS_FA[type],
                  file_name: view.file_name,
                  content_type: view.content_type,
                  size_bytes: view.size_bytes,
                  sha256: view.sha256,
                },
                ip: meta.ip,
                userAgent: meta.userAgent,
                requestId: meta.requestId,
              },
              client,
            );

            return toEntityAttachmentItem(view);
          },
        );
      });
    } catch (err) {
      // تراکنش برگشت خورده است (ردیف attachment وجود ندارد) ⇒ شیءِ استوریج
      // حتماً اورفان است. پاکسازی best-effort؛ خطای اصلی پوشانده نمیشود.
      if (storageKey) await this.storage.remove(storageKey).catch(() => undefined);
      throw err;
    }
  }

  /** URL امضاشدهٔ تازه، فقط برای ضمیمهای دقیقاً همین مالک و همین شرکت. */
  async url(
    actor: EntityAttachmentActor,
    ownerType: string,
    ownerId: string,
    attachmentId: string,
  ): Promise<AttachmentUrlView> {
    const type = this.assertOwnerType(ownerType);
    this.assertOwnerId(ownerId);
    await this.assertPermission(actor, 'attachment.view');

    if (!isUUID(attachmentId, '4')) {
      throw new NotFoundException({
        code: 'entity_attachment_not_found',
        message_fa: 'ضمیمهٔ این موجودیت یافت نشد.',
      });
    }
    // ریپوزیتوری موجود، company_id نشست و زوج (owner_type, owner_id) مسیر
    // را قید میزند؛ ضمیمهٔ رکوردی دیگر حتی در همان شرکت ۴۰۴ میگیرد.
    const row = await this.attachmentRepo.findByIdInCompany(attachmentId, actor.companyId);
    if (!row || row.owner_type !== type || row.owner_id !== ownerId) {
      throw new NotFoundException({
        code: 'entity_attachment_not_found',
        message_fa: 'ضمیمهٔ این موجودیت یافت نشد.',
      });
    }
    // downloadUrl دوباره زنجیرهٔ مالکیت والد را راستیآزمایی میکند.
    return this.attachments.downloadUrl(attachmentId, {
      userId: actor.userId,
      companyId: actor.companyId,
    });
  }
}
