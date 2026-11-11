import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import type { RequestMeta } from '../../common/request-meta';
import { ATTACHMENTS_REPOSITORY } from '../attachments/tokens';
import { ATTACHMENTS_SERVICE } from '../attachments/tokens';
import { STORAGE_SERVICE } from '../attachments/tokens';
import type { AttachmentsRepository } from '../attachments/attachments.repository';
import type {
  AttachmentsService,
  UploadedFile,
} from '../attachments/attachments.service';
import type { StorageService } from '../attachments/storage.service';
import type { AttachmentView } from '../attachments/attachments.dto';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';
import { CatalogAccess } from './catalog-access.service';
import {
  PRODUCT_MEDIA_IMAGE_TYPES,
  PRODUCT_MEDIA_OWNER_TYPE,
  PRODUCT_MEDIA_PRIMARY_LABEL_FA,
  PRODUCT_MEDIA_PRIMARY_RULE,
  findClientOwnerFields,
  toProductMediaItem,
  toProductMediaItems,
  type ProductMediaItem,
} from './product-media.rules';

interface ProductRef extends QueryResultRow {
  id: string;
  code: string;
  name: string;
}

/** نمای محصولمحورِ تصاویر/اسناد — هیچ فیلد دامنهای، وضعیت یا عضویتی ندارد. */
export interface ProductMediaView {
  product_id: string;
  product_code: string;
  product_name: string;
  items: ProductMediaItem[];
  primary_image: ProductMediaItem | null;
  counts: { images: number; documents: number; total: number };
  primary_image_rule: typeof PRODUCT_MEDIA_PRIMARY_RULE;
  primary_image_label_fa: string;
  primary_image_note_fa: string;
  message_fa: string;
}

const PRIMARY_NOTE_FA =
  'تصویرِ اصلی بهصورت خودکار قدیمیترین تصویرِ این کالاست؛ با حذف آن، تصویرِ بعدی بهصورت خودکار اصلی میشود.';
const VIEW_NOTE_FA =
  'تصاویر و اسناد این کالا صرفاً متعلق به کاتالوگ مرکزی هستند و هیچ وضعیت، عضویت یا دسترسپذیری دامنهای را نشان نمیدهند.';

/**
 * سرویس «مرکز تصاویر و اسناد کالا» (TASK-PM-02-C1).
 *
 * ارزشِ افزوده نسبت به `/attachments` عمومی:
 *   ۱. مالک و شرکت فقط از مسیر و نشست مشتق میشوند؛ کلاینت نمیتواند `owner_id`
 *      شرکت/موجودیت دیگری را در بدنهٔ multipart تزریق کند (چک صریح + رد ۴۰۰).
 *   ۲. مجوزهای محصولمحورِ §F در لایهٔ route و دوباره از روی DB بازاعتبارسنجی
 *      میشوند؛ مجوزهای ضمیمه نیز همچنان لازماند (دفاع در عمق، بدون ساختن مجوز تازه).
 *   ۳. نمای خواندن، قاعدهٔ مصوب §B4 «نخستین بر اساس created_at = تصویر اصلی»
 *      را محاسبه و برچسب «اصلی (خودکار)» را برمیگرداند، بدون هیچ ستون/مهاجرت تازه.
 *   ۴. آپلود در همان تراکنشِ کاتالوگ ممیزی میشود؛ اگر ثبت ممیزی شکست بخورد،
 *      تراکنش برگشت میخورد و شیءِ آپلودشده از آبجکتاستوریج پاک میگردد تا
 *      «فایل بدون ردیف و بدون ممیزی» باقی نماند.
 *
 * مرزها: نه جدول/مهاجرت/RLS تازه، نه هویت یا عضویت دامنه، نه `sort_order`/
 * `is_primary` ذخیرهشده، نه حذف ضمیمه (مسیر حذفِ مصوبی وجود ندارد تا invent نشود)،
 * نه تغییر در `POST /attachments` و قراردادهای import/export/history/bulk.
 */
@Injectable()
export class ProductMediaService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(ATTACHMENTS_SERVICE) private readonly attachments: AttachmentsService,
    @Inject(ATTACHMENTS_REPOSITORY) private readonly attachmentRepo: AttachmentsRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly access: CatalogAccess,
  ) {}

  /** کالا باید دقیقاً در شرکتِ نشست باشد؛ ۴۰۴ برای جلوگیری از افشای وجود کالای شرکت دیگر. */
  private async assertProductInCompany(
    companyId: string,
    productId: string,
  ): Promise<ProductRef> {
    if (!isUUID(productId, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسهٔ کالا معتبر نیست.',
      });
    }
    const { rows } = await this.pool.query<ProductRef>(
      `select id, code, name from product
        where id = $1::uuid and company_id = $2::uuid and deleted_at is null`,
      [productId, companyId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'product_not_found',
        message_fa: 'کالایی با این شناسه در شرکت شما یافت نشد.',
      });
    }
    return row;
  }

  /** قدیمیترین تصویرِ همین کالا؛ محاسبه در لحظه، بدون ذخیرهسازی. */
  private async findPrimaryImageId(companyId: string, productId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from attachment
        where company_id = $1::uuid and owner_type = 'product' and owner_id = $2::uuid
          and content_type = any($3::text[])
        order by created_at asc, id asc
        limit 1`,
      [companyId, productId, [...PRODUCT_MEDIA_IMAGE_TYPES]],
    );
    return rows[0]?.id ?? null;
  }

  async list(user: AuthContext, productId: string): Promise<ProductMediaView> {
    const { companyId, userId } = user;
    await this.access.assert(companyId, userId, 'master.product.view');
    await this.access.assert(companyId, userId, 'attachment.view');
    const product = await this.assertProductInCompany(companyId, productId);

    // listForOwner دوباره زنجیرهٔ مالکیت را در DB اثبات میکند و URL امضاشده میسازد.
    const views: AttachmentView[] = await this.attachments.listForOwner(
      PRODUCT_MEDIA_OWNER_TYPE,
      productId,
      { userId, companyId },
    );
    const items = toProductMediaItems(views);
    const images = items.filter((i) => i.kind === 'image');
    const documents = items.filter((i) => i.kind === 'document');

    return {
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      items,
      primary_image: images.find((i) => i.is_primary) ?? null,
      counts: { images: images.length, documents: documents.length, total: items.length },
      primary_image_rule: PRODUCT_MEDIA_PRIMARY_RULE,
      primary_image_label_fa: PRODUCT_MEDIA_PRIMARY_LABEL_FA,
      primary_image_note_fa: PRIMARY_NOTE_FA,
      message_fa: VIEW_NOTE_FA,
    };
  }

  async upload(
    user: AuthContext,
    productId: string,
    file: UploadedFile | undefined,
    body: unknown,
    meta: RequestMeta,
  ): Promise<ProductMediaItem> {
    const { companyId, userId } = user;
    const clientFields = findClientOwnerFields(body);
    if (clientFields.length > 0) {
      throw new BadRequestException({
        code: 'product_media_owner_scope_rejected',
        message_fa:
          'مالک و شرکت ضمیمه فقط از نشست و نشانی کالا تعیین میشود؛ ارسال این فیلدها مجاز نیست.',
        details: { fields: clientFields },
      });
    }

    return this.access.write(companyId, userId, 'master.product.update', async () => {
      await this.access.assert(companyId, userId, 'attachment.upload');
      await this.assertProductInCompany(companyId, productId);

      const view = await this.attachments.upload(
        file,
        { owner_type: PRODUCT_MEDIA_OWNER_TYPE, owner_id: productId },
        { userId, companyId },
      );
      const stored = await this.attachmentRepo.findByIdInCompany(view.id, companyId);
      const storageKey = stored?.storage_key ?? null;

      try {
        await this.audit.recordRequired({
          companyId,
          actorUserId: userId,
          action: 'create',
          entityType: 'product_media',
          entityId: productId,
          after: {
            attachment_id: view.id,
            owner_type: PRODUCT_MEDIA_OWNER_TYPE,
            owner_id: productId,
            file_name: view.file_name,
            content_type: view.content_type,
            size_bytes: view.size_bytes,
            sha256: view.sha256,
            primary_image_rule: PRODUCT_MEDIA_PRIMARY_RULE,
          },
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
      } catch (err) {
        // ثبت ممیزی fail-closed است: تراکنشِ insert برگشت میخورد، پس شیءِ
        // آپلودشده هم پاک شود تا اورفانِ بدون ردیف و بدون ممیزی نماند.
        if (storageKey) await this.storage.remove(storageKey).catch(() => undefined);
        throw err;
      }

      const primaryId = await this.findPrimaryImageId(companyId, productId);
      return toProductMediaItem(view, primaryId);
    });
  }

  /** URL امضاشدهٔ تازه فقط برای ضمیمهای که دقیقاً به همین کالا گره خورده است. */
  async url(
    user: AuthContext,
    productId: string,
    mediaId: string,
  ): Promise<{ url: string; expires_in: number }> {
    const { companyId, userId } = user;
    await this.access.assert(companyId, userId, 'master.product.view');
    await this.access.assert(companyId, userId, 'attachment.view');
    await this.assertProductInCompany(companyId, productId);

    if (!isUUID(mediaId, '4')) {
      throw new NotFoundException({
        code: 'media_not_found',
        message_fa: 'ضمیمهٔ این کالا یافت نشد.',
      });
    }
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from attachment
        where id = $1::uuid and company_id = $2::uuid
          and owner_type = 'product' and owner_id = $3::uuid`,
      [mediaId, companyId, productId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'media_not_found',
        message_fa: 'ضمیمهٔ این کالا یافت نشد.',
      });
    }
    // downloadUrl خودش دوباره زنجیرهٔ مالکیت را راستیآزمایی میکند.
    return this.attachments.downloadUrl(mediaId, { userId, companyId });
  }
}
