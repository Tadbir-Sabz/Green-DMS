import { permissionMatches } from '../identity-rbac/permissions';
import { CatalogAccess } from './catalog-access.service';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuditService } from '../../common/audit.service';
import { AUDIT_SERVICE } from '../../common/audit.service';
import { PRODUCT_CSV_HEADERS, parseCsv } from '../../common/csv';
import {
  foldDigits,
  normalizeAttributeValue,
  normalizeBarcode,
  normalizeText,
  variantSignature,
} from './product-normalize';
import {
  assertSensitiveConfirmed,
  detectSensitiveProductChanges,
  type SensitiveChange,
} from './product-sensitivity';
import type {
  AttributeDefRow,
  AttributeValueRow,
  BarcodeRow,
  BundleRow,
  FamilyRow,
} from './product-master.repository';
import { ProductMasterRepository } from './product-master.repository';
import {
  REQUIRED_ATTRIBUTE_MISSING_CODE,
  findMissingRequiredAttributes,
  readLifecycleEnforcementMode,
} from './product-attribute-requirements';
import type { RequestMeta } from '../../common/request-meta';
import { OrderCreationLock } from '../sales/order-creation-lock';
import {
  buildImportResult,
  classifyDomainCode,
  classifyImportError,
  importIssue,
  normalizeBatchOutcome,
  summarizeImportBatches,
  type ImportBatchOutcome,
  type ImportFailure,
  type ImportIssue,
  type ImportRecord,
  type ImportResult,
} from './product-import-reliability';

const IMPORT_BATCH_SIZE = 100;
type ImportRowError = { row: number; code: string; message_fa: string };
type ProductImportLookup = Awaited<ReturnType<ProductMasterRepository['getProductsForImport']>>;
type ImportCommitRequest = {
  csv: string;
  mode: 'create' | 'update' | 'upsert';
  idempotency_key: string;
  confirm_sensitive?: boolean;
};
type PreparedImportRow = {
  rowNo: number;
  row: Record<string, string>;
  existingId: string | null;
  categoryId: string;
  uomId: string;
  taxId: string | null;
};
interface RunImportBatchArgs {
  companyId: string;
  importId: string;
  actorUserId: string;
  meta: RequestMeta;
  dto: ImportCommitRequest;
  batchNo: number;
  start: number;
  batch: Record<string, string>[];
  categories: Map<string, string>;
  uoms: Map<string, string>;
  taxes: Map<string, string>;
  existingByCode: ProductImportLookup;
  validationErrorsByRow: Map<number, ImportRowError[]>;
}
const sortIssues = (a: ImportIssue, b: ImportIssue): number =>
  a.row - b.row || a.code.localeCompare(b.code);
const countFailedRows = (issues: ImportIssue[]): number =>
  new Set(issues.filter((i) => i.status !== 'created' && i.status !== 'updated').map((i) => i.row)).size;

/**
 * سرویسِ Product Master (P1) — قواعدِ کسب‌وکارِ طرحِ هدف و مصوبات D1–D5.
 *
 * نکته‌های کلیدی:
 * - D1: کدِ SKU دستی + تولیدِ خودکار (شمارندهٔ اتمی در product_code_seq).
 * - D2: تکرارِ کد ممنوع؛ نامِ مشابه فقط هشدار (duplicate-check).
 * - D4: فیلدهای حساس در مرزِ نوشتنِ همین سرویس (همهٔ مسیرها) + audit.
 * - D5: bundle فقط کاتالوگ؛ `assertNotBundle` برای مسیرهای سفارش/فروش/موجودی.
 * - H-1: بارکد با یکتاییِ نوع‌محور + resolution قطعیِ اسکن.
 * - M-3: امضای variant قطعی و تغییرناپذیر پس از نخستینِ ارجاعِ عملیاتی.
 */
@Injectable()
export class ProductMasterService {
  constructor(
    private readonly access: CatalogAccess,
    private readonly repo: ProductMasterRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    private readonly creationLock: OrderCreationLock,
  ) {}

  // =================================================================
  // D1 — کدِ SKU
  // =================================================================
  /** تولیدِ کدِ خودکارِ یکتا (SKU-000001…) با retry برای برخوردِ احتمالی با کدهای دستی */
  private async generateSkuCode(companyId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const seq = await this.repo.nextCodeSeq(companyId);
      const code = `SKU-${String(seq).padStart(6, '0')}`;
      if (!(await this.repo.productCodeExists(companyId, code))) return code;
    }
    throw new ConflictException({
      code: 'sku_generation_conflict',
      message_fa: 'تولیدِ خودکارِ کدِ کالا با برخورد مواجه شد؛ لطفاً کد را دستی وارد کنید.',
    });
  }

  // =================================================================
  // D2 — تشخیصِ تکرار (فقط هشدار برای نام؛ ممنوعیتِ سخت برای کد)
  // =================================================================
  async duplicateCheck(
    companyId: string,
    q: { name?: string; code?: string; barcode?: string; product_id?: string },
  ): Promise<{
    blocking: { kind: string; product_id: string; code: string; name: string }[];
    warnings: { kind: string; product_id: string; code: string; name: string; score?: number }[];
  }> {
    const blocking: { kind: string; product_id: string; code: string; name: string }[] = [];
    const warnings: { kind: string; product_id: string; code: string; name: string; score?: number }[] = [];

    if (q.code) {
      const codeNorm = normalizeText(q.code);
      const conflicts = await this.repo.findAliasConflicts(companyId, codeNorm);
      for (const c of conflicts) {
        if (c.product_id === q.product_id) continue;
        if (c.kind === 'product_code') blocking.push(c);
      }
    }
    if (q.barcode) {
      const matches = await this.repo.findBarcodeMatches(normalizeBarcode(q.barcode));
      for (const m of matches) {
        if (m.product_id === q.product_id) continue;
        blocking.push({ kind: 'barcode', product_id: m.product_id, code: m.product_code ?? '', name: m.product_name ?? '' });
      }
    }
    if (q.name) {
      const similar = await this.repo.findSimilarNames(companyId, q.name, q.product_id);
      for (const s of similar) {
        warnings.push({ kind: 'similar_name', product_id: s.id, code: s.code, name: s.name, score: Number(s.score) });
      }
    }
    return { blocking, warnings };
  }

  // =================================================================
  // خانواده
  // =================================================================
  async listFamilies(companyId: string): Promise<FamilyRow[]> {
    return this.repo.listFamilies(companyId);
  }

  async createFamily(companyId: string, code: string, name: string, meta: RequestMeta, actorUserId: string): Promise<FamilyRow> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    if (typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim() || code.length > 64 || name.length > 255) {
      throw new BadRequestException({ code: 'invalid_family', message_fa: 'کد و نام خانواده معتبر نیست.' });
    }
    let row: FamilyRow;
    try { row = await this.repo.createFamily(companyId, code.trim(), name.trim()); }
    catch (err) {
      if ((err as {code?: string}).code === '23505') throw new ConflictException({code:'duplicate_family',message_fa:'کد خانواده قبلاً ثبت شده است.'});
      throw err;
    }
    await this.audit.record({
      companyId, actorUserId, action: 'create', entityType: 'product_family', entityId: row.id,
      after: row, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return row;

 });
 }

  // =================================================================
  // alias
  // =================================================================
  // =================================================================
  // alias (هویتِ کالا)
  // TASK-PM-02-C7: این سطح به `ProductIdentityService`/`ProductIdentityController`
  // منتقل شد (نمای کامل با برخوردهای نرم، افزودن/حذف با ممیزیِ fail-closed،
  // رد صریح فیلدهای کلاینتی و سقفِ فنی). هیچ نسخهٔ تکراری باقی نمانده است.
  // =================================================================

  // =================================================================
  // صفات (B3)
  // =================================================================
  async listAttributeDefs(companyId: string): Promise<AttributeDefRow[]> {
    return this.repo.listAttributeDefs(companyId);
  }

  async createAttributeDef(
    companyId: string,
    d: { code: string; title: string; kind: string; is_variant_axis?: boolean; is_required?: boolean; sort_order?: number; enum_values?: string[] },
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<AttributeDefRow & { enum_values?: { id: string; value: string }[] }> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    if (!['text', 'number', 'enum'].includes(d.kind)) {
      throw new BadRequestException({ code: 'invalid_kind', message_fa: 'نوعِ صفت باید text یا number یا enum باشد.' });
    }
    if (d.kind === 'enum' && (!d.enum_values || d.enum_values.length === 0)) {
      throw new BadRequestException({
        code: 'enum_values_required',
        message_fa: 'برای صفتِ enum باید دست‌کم یک مقدارِ مجاز تعریف شود.',
      });
    }
    // C7 (اصلاحِ انحرافِ قرارداد): قرارداد برای کدِ تکراری ۴۰۹ اعلام کرده است؛
    // پیش‌تر نقضِ یکتایی به ۵۰۰ تبدیل می‌شد.
    let def: AttributeDefRow;
    try {
      def = await this.repo.createAttributeDef(companyId, {
        code: d.code, title: d.title, kind: d.kind,
        is_variant_axis: d.is_variant_axis ?? false,
        is_required: d.is_required ?? false,
        sort_order: d.sort_order ?? 0,
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'duplicate_attribute_code',
          message_fa: 'صفتی با همین کد در کاتالوگ این شرکت وجود دارد.',
        });
      }
      throw err;
    }
    const enumValues: { id: string; value: string }[] = [];
    if (d.kind === 'enum') {
      for (const v of d.enum_values ?? []) {
        try {
          enumValues.push(await this.repo.addEnumValue(def.id, v, normalizeAttributeValue('enum', v)));
        } catch (err) {
          if ((err as { code?: string }).code === '23505') {
            throw new ConflictException({
              code: 'duplicate_enum_value',
              message_fa: `مقدارِ «${v}» در فهرستِ مقادیرِ مجازِ این صفت تکراری است.`,
            });
          }
          throw err;
        }
      }
    }
    await this.audit.record({
      companyId, actorUserId, action: 'create', entityType: 'product_attribute_def', entityId: def.id,
      after: { ...def, enum_values: enumValues }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return { ...def, enum_values: enumValues };

 });
 }

  async addAttributeEnumValue(companyId: string, defId: string, value: string, meta: RequestMeta, actorUserId: string) {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    const def = await this.repo.getAttributeDef(companyId, defId);
    if (!def) throw new NotFoundException({ code: 'not_found', message_fa: 'صفت یافت نشد.' });
    if (def.kind !== 'enum') {
      throw new BadRequestException({ code: 'not_enum', message_fa: 'فقط صفتِ enum مقدارِ مجاز می‌گیرد.' });
    }
    let row: { id: string; value: string };
    try {
      row = await this.repo.addEnumValue(defId, value, normalizeAttributeValue('enum', value));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'duplicate_enum_value',
          message_fa: `مقدارِ «${value}» در فهرستِ مقادیرِ مجازِ این صفت تکراری است.`,
        });
      }
      throw err;
    }
    await this.audit.record({
      companyId, actorUserId, action: 'create', entityType: 'product_attribute_enum_value', entityId: row.id,
      after: { def_id: defId, value }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return row;

 });
 }

  async listEnumValues(companyId: string, defId: string) {
    const def = await this.repo.getAttributeDef(companyId, defId);
    if (!def) throw new NotFoundException({ code: 'not_found', message_fa: 'صفت یافت نشد.' });
    return this.repo.listEnumValues(defId);
  }

  /**
   * ثبتِ مقادیرِ صفاتِ یک SKU + محاسبهٔ امضای variant.
   * - اعتبارسنجیِ kind/enum (B3)؛ الزامِ is_required
   * - M-3: امضا قطعی؛ تغییرناپذیری پس از نخستینِ ارجاعِ عملیاتی
   */
  // =================================================================
  // مقادیرِ صفاتِ SKU (B3 + M-3)
  // TASK-PM-02-C7: خواندن/نوشتنِ مقادیر به `ProductIdentityService` منتقل شد
  // (نمای کامل تعاریف+مقدار+الزام+محور+امضا، پاک‌کردنِ مقدار با `clear`،
  // اصلاح ۵۰۰ واقعیِ مقدارِ خالی). کاتالوگِ صفات (تعریف/مقدارِ مجاز) همان‌جا در
  // این سرویس می‌ماند چون منبعِ حقیقتِ کاتالوگ است.
  // =================================================================

  // =================================================================
  // روابط (جایگزین/مکمل)
  // TASK-PM-02-C6: این سطح به `ProductRelationsService`/`ProductRelationsController`
  // منتقل شد (نمای کامل خروجی/ورودی، تاریخچهٔ ۰۰۶۰، پیمایشِ محدود، ویرایشِ
  // اولویت، افزودن/حذف با ممیزیِ fail-closed، رد صریح فیلدهای کلاینتی).
  // هیچ نسخهٔ تکراری یا ضعیف‌تر در این سرویس باقی نمانده است.
  // =================================================================

  // =================================================================
  // bundle — کاتالوگ در P1 (D5)
  // =================================================================
  async listBundle(companyId: string, bundleProductId: string): Promise<BundleRow[]> {
    return this.repo.listBundle(bundleProductId);
  }

  /** تنظیمِ ترکیبِ بسته — فیلدِ حساس (D4) + فقط کاتالوگ (D5) */
  async setBundle(
    companyId: string,
    bundleProductId: string,
    items: { component_product_id: string; qty: number }[],
    opts: { confirm_sensitive: boolean },
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<BundleRow[]> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    await this.assertProduct(companyId, bundleProductId);
    if (items.length === 0) {
      throw new BadRequestException({ code: 'empty_bundle', message_fa: 'بسته باید دست‌کم یک جزء داشته باشد.' });
    }
    const seen = new Set<string>();
    for (const item of items) {
      if (item.component_product_id === bundleProductId) {
        throw new BadRequestException({ code: 'self_bundle', message_fa: 'کالا نمی‌تواند جزءِ خودش باشد.' });
      }
      if (seen.has(item.component_product_id)) {
        throw new BadRequestException({ code: 'duplicate_component', message_fa: 'جزءِ تکراری در ترکیبِ بسته.' });
      }
      seen.add(item.component_product_id);
      await this.assertProduct(companyId, item.component_product_id);
      if (item.qty <= 0) {
        throw new BadRequestException({ code: 'invalid_qty', message_fa: 'مقدارِ جزء باید بزرگ‌تر از صفر باشد.' });
      }
      // جزء نمی‌تواند خودش بستهٔ دیگری باشد (بدونِ semantics عملیاتیِ تو در تو تا P5)
      const nested = await this.repo.findBundleProductIds([item.component_product_id]);
      if (nested.length > 0) {
        throw new BadRequestException({
          code: 'nested_bundle_forbidden',
          message_fa: 'بستهٔ تو در تو تا تکمیلِ semantics عملیاتی در P5 مجاز نیست.',
        });
      }
    }

    // D4: اجزای bundle حساس — تأییدِ صریح + audit (fallback پیش از G-03)
    const before = await this.repo.listBundle(bundleProductId);
    assertSensitiveConfirmed(
      [{ field: 'bundle_components', before: before.map((b) => b.component_product_id), after: [...seen] }],
      opts.confirm_sensitive,
      true,
      'تغییرِ ترکیبِ بسته',
    );

    await this.repo.replaceBundle(
      bundleProductId,
      items.map((i) => ({ componentProductId: i.component_product_id, qty: String(i.qty) })),
    );
    const after = await this.repo.listBundle(bundleProductId);
    await this.audit.record({
      companyId, actorUserId, action: 'update', entityType: 'product_bundle', entityId: bundleProductId,
      before, after,
      ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return after;

 });
 }

  /**
   * D5 — ممنوعیتِ صریحِ P1: SKU بسته نباید قابلِ سفارش/فروش باشد یا در حرکتِ موجودی شرکت کند.
   * این guard در serviceِ فروش/فاکتور/موجودی صدا زده می‌شود.
   */
  async assertNotBundle(productIds: string[], action = 'این عملیات'): Promise<void> {
    const bundles = await this.repo.findBundleProductIds(productIds);
    if (bundles.length > 0) {
      throw new BadRequestException({
        code: 'bundle_not_orderable',
        message_fa:
          `${action} برای محصولِ «بسته» تا پیاده‌سازیِ کاملِ semantics عملیاتی در P5 مجاز نیست (مصوبهٔ D5). ` +
          'فروشِ بسته فقط پس از فازِ P5 فعال می‌شود.',
        details: { bundle_product_ids: bundles },
      });
    }
  }

  // =================================================================
  // بارکد (H-1)
  // =================================================================
  async listBarcodes(companyId: string, productId: string): Promise<BarcodeRow[]> {
    return this.repo.listBarcodes(companyId, productId);
  }

  async addBarcode(
    companyId: string,
    productId: string,
    dto: { barcode: string; kind: string; packaging_id?: string | null; is_primary?: boolean },
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<BarcodeRow> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    await this.assertProduct(companyId, productId);
    const kinds = ['gs1_ean13', 'gs1_ean8', 'gs1_upc', 'gs1_itf14', 'internal', 'other'];
    if (!kinds.includes(dto.kind)) {
      throw new BadRequestException({ code: 'invalid_barcode_kind', message_fa: 'نوعِ بارکد معتبر نیست.' });
    }
    const value = normalizeBarcode(dto.barcode);
    if (!value) {
      throw new BadRequestException({ code: 'invalid_barcode', message_fa: 'مقدارِ بارکد خالی است.' });
    }
    if (dto.kind.startsWith('gs1_') && !/^\d+$/.test(value)) {
      throw new BadRequestException({
        code: 'invalid_barcode',
        message_fa: 'بارکدِ استانداردِ GS1 فقط شاملِ رقم است (پس از نرمال‌سازی).',
      });
    }
    if (dto.kind === 'gs1_ean13' && value.length !== 13) {
      throw new BadRequestException({ code: 'invalid_barcode', message_fa: 'EAN-13 باید ۱۳ رقم باشد.' });
    }
    if (dto.kind === 'gs1_ean8' && value.length !== 8) {
      throw new BadRequestException({ code: 'invalid_barcode', message_fa: 'EAN-8 باید ۸ رقم باشد.' });
    }
    if (dto.kind === 'gs1_upc' && value.length !== 12) {
      throw new BadRequestException({ code: 'invalid_barcode', message_fa: 'UPC-A باید ۱۲ رقم باشد.' });
    }
    if (dto.kind === 'gs1_itf14' && value.length !== 14) {
      throw new BadRequestException({ code: 'invalid_barcode', message_fa: 'ITF-14 باید ۱۴ رقم باشد.' });
    }

    // جلوگیری از برخوردِ سراسریِ look-up: بارکد نباید با کد/aliasِ نوعِ code هم‌ارز باشد (H-1)
    const collisions = await this.repo.codeAliasCollisions(companyId, normalizeText(value), productId);
    if (collisions.length > 0) {
      throw new ConflictException({
        code: 'barcode_collision',
        message_fa: 'این مقدار با کد یا aliasِ کدِ محصولِ دیگری هم‌ارز است و resolution اسکن را دوپهلو می‌کند.',
        details: collisions,
      });
    }

    if (dto.is_primary) {
      await this.repo.clearPrimaryBarcodes(productId, dto.packaging_id ?? null);
    }
    try {
      const row = await this.repo.insertBarcode({
        companyId,
        productId,
        packagingId: dto.packaging_id ?? null,
        barcode: value,
        kind: dto.kind,
        isPrimary: dto.is_primary ?? false,
      });
      await this.audit.record({
        companyId, actorUserId, action: 'create', entityType: 'product_barcode', entityId: row.id,
        after: row, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
      });
      return row;
    } catch (err) {
      throw this.mapBarcodeDbError(err);
    }

 });
 }

  async removeBarcode(companyId: string, id: string, meta: RequestMeta, actorUserId: string): Promise<void> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    const ok = await this.repo.deleteBarcode(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'بارکد یافت نشد.' });
    await this.audit.record({
      companyId, actorUserId, action: 'delete', entityType: 'product_barcode', entityId: id,
      ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });

 });
 }

  /**
   * resolution قطعیِ اسکن (H-1): (۱) product_barcode ← (۲) product.code ← (۳) alias نوعِ code.
   * برخوردِ چندپاسخی = خطای صریحِ فارسی — هرگز انتخابِ خودسرانه.
   */
  async scanResolve(
    companyId: string,
    raw: string,
  ): Promise<{ product: { id: string; code: string; name: string; status: string }; matched_by: string; packaging_id?: string | null }> {
    const norm = normalizeBarcode(raw);
    if (!norm) throw new BadRequestException({ code: 'invalid_code', message_fa: 'مقدارِ اسکن خالی است.' });

    // ۱) بارکد — اولویت با شرکتِ نشست؛ برای gs1 ممکن است ردیفِ جهانیِ شرکتِ دیگر هم باشد
    const matches = await this.repo.findBarcodeMatches(norm);
    const own = matches.filter((m) => m.company_id === companyId);
    const candidates = own.length > 0 ? own : matches.filter((m) => m.kind.startsWith('gs1_'));
    if (candidates.length > 1) {
      const productIds = [...new Set(candidates.map((c) => c.product_id))];
      if (productIds.length > 1) {
        throw new ConflictException({
          code: 'ambiguous_scan',
          message_fa: 'این بارکد به چند کالا تخصیص یافته است؛ لطفاً از طریقِ کدِ کالا اقدام کنید.',
          details: { product_ids: productIds },
        });
      }
    }
    if (candidates.length > 0) {
      const c = candidates[0];
      return {
        product: { id: c.product_id, code: c.product_code ?? '', name: c.product_name ?? '', status: 'active' },
        matched_by: 'barcode',
        packaging_id: c.packaging_id,
      };
    }

    // ۲) کدِ کالا
    const byCode = await this.repo.findProductByCode(companyId, foldDigits(raw.trim()));
    if (byCode.length > 1) {
      throw new ConflictException({
        code: 'ambiguous_scan',
        message_fa: 'این مقدار به چند کالا تخصیص یافته است.',
        details: { product_ids: byCode.map((p) => p.id) },
      });
    }
    if (byCode.length === 1) {
      const p = byCode[0];
      return { product: { id: p.id, code: p.code, name: p.name, status: p.status }, matched_by: 'code' };
    }

    // ۳) alias نوعِ code
    const byAlias = await this.repo.findProductByCodeAlias(companyId, normalizeText(raw));
    if (byAlias.length > 1) {
      throw new ConflictException({
        code: 'ambiguous_scan',
        message_fa: 'این مقدار به چند کالا تخصیص یافته است.',
        details: { product_ids: byAlias.map((p) => p.id) },
      });
    }
    if (byAlias.length === 1) {
      const p = byAlias[0];
      return { product: { id: p.id, code: p.code, name: p.name, status: p.status }, matched_by: 'alias_code' };
    }

    throw new NotFoundException({ code: 'not_found', message_fa: 'کالایی با این بارکد/کد یافت نشد.' });
  }

  // =================================================================
  // import (§E + M-5)
  // =================================================================
  /**
   * اعتبارسنجیِ CSV بدونِ نوشتن — گزارشِ فارسیِ ردیف‌به‌ردیف.
   * حداکثرِ P1: ≤۱۰٬۰۰۰ ردیف، ≤۱ مگابایت.
   */
  validateImport(companyId: string, csvText: string): {
    rows: Record<string, string>[];
    row_errors: { row: number; code: string; message_fa: string }[];
    warnings: { row: number; code: string; message_fa: string }[];
    headers: string[];
  } {
    if (csvText.length > 1024 * 1024) {
      throw new BadRequestException({ code: 'file_too_large', message_fa: 'حجمِ فایل بیش از ۱ مگابایت است (سقفِ P1).' });
    }
    const table = parseCsv(csvText);
    if (table.length < 2) {
      throw new BadRequestException({ code: 'empty_file', message_fa: 'فایل باید دست‌کم یک ردیفِ سربرگ و یک ردیفِ داده داشته باشد.' });
    }
    const headerCells = table[0].map((h) => h.trim());
    const headers = headerCells.map((h) => PRODUCT_CSV_HEADERS[h.toLowerCase()] ?? PRODUCT_CSV_HEADERS[h] ?? '');
    const idx = (name: string) => headers.indexOf(name);
    if (idx('code') < 0 && idx('name') < 0) {
      throw new BadRequestException({ code: 'invalid_header', message_fa: 'سربرگ باید دست‌کم شاملِ «کد» یا «نام» باشد.' });
    }
    if (table.length - 1 > 10000) {
      throw new BadRequestException({ code: 'too_many_rows', message_fa: 'تعدادِ ردیف‌ها بیش از سقفِ ۱۰٬۰۰۰ ردیف است.' });
    }

    const row_errors: { row: number; code: string; message_fa: string }[] = [];
    const warnings: { row: number; code: string; message_fa: string }[] = [];
    const rows: Record<string, string>[] = [];
    const seenCodes = new Map<string, number>();

    for (let r = 1; r < table.length; r++) {
      const cells = table[r];
      const row: Record<string, string> = {};
      headers.forEach((key, i) => {
        if (key) row[key] = (cells[i] ?? '').trim();
      });
      rows.push(row);
      const rowNo = r + 1;

      if (!row.name && !row.code) {
        row_errors.push({ row: rowNo, code: 'missing_identity', message_fa: 'ردیف نه «کد» دارد نه «نام».' });
        continue;
      }
      if (row.code) {
        const prev = seenCodes.get(row.code);
        if (prev) {
          row_errors.push({ row: rowNo, code: 'duplicate_in_file', message_fa: `کدِ «${row.code}» در ردیفِ ${prev} هم آمده است.` });
        }
        seenCodes.set(row.code, rowNo);
      }
      if (row.min_order_qty && Number.isNaN(Number(foldDigits(row.min_order_qty)))) {
        row_errors.push({ row: rowNo, code: 'invalid_number', message_fa: 'حداقلِ سفارش باید عدد باشد.' });
      }
      if (row.weight_gr && Number.isNaN(Number(foldDigits(row.weight_gr)))) {
        row_errors.push({ row: rowNo, code: 'invalid_number', message_fa: 'وزن باید عدد باشد.' });
      }
      if (row.distribution_kind && !['cold', 'warm', 'both'].includes(row.distribution_kind)) {
        row_errors.push({ row: rowNo, code: 'invalid_enum', message_fa: 'نوعِ توزیع باید cold/warm/both باشد.' });
      }
      if (row.status && !['active', 'blocked', 'discontinued'].includes(row.status)) {
        row_errors.push({ row: rowNo, code: 'invalid_enum', message_fa: 'وضعیت باید active/blocked/discontinued باشد.' });
      } else if (row.status === 'discontinued') {
        // TASK-PM-02-C5: «متوقف» یک مقدار موجودِ enum است، ولی همهٔ گذارهای به/از آن
        // تا تصویب مالک BLOCKED / NOT AUTHORIZEDاند. پیش‌نمایش باید همان سیاستِ
        // نگهبانِ D4 را از قبل و در سطح ردیف نشان دهد، نه اینکه ردیف را سالم اعلام
        // کند و سپس کل دسته را در commit رد کند.
        row_errors.push({
          row: rowNo,
          code: 'lifecycle_transition_blocked',
          message_fa: 'گذار به وضعیت «متوقف» تا تصویب مالک BLOCKED / NOT AUTHORIZED است؛ این ردیف پذیرفته نمی‌شود.',
        });
      }
      if (!row.category_code) {
        row_errors.push({ row: rowNo, code: 'missing_category', message_fa: 'کدِ گروه (category_code) الزامی است.' });
      }
      if (!row.base_uom_code) {
        row_errors.push({ row: rowNo, code: 'missing_uom', message_fa: 'کدِ واحدِ پایه (base_uom_code) الزامی است.' });
      }
    }
    return { rows, row_errors, warnings, headers: headerCells };
  }

  /**
   * اجرای import (§E): همه‌یاهیچ در هر دسته؛ idempotency_key؛ audit؛
   * M-5: ردیفِ دارایِ فیلدِ حساس **بدونِ** confirm_sensitive پذیرفته نمی‌شود
   * (هرگز با فقط مجوزِ import از کنترلِ D4 عبور نمی‌کند).
   *
   * TASK-PM-01D-M2: قفل advisory فقط روی (شرکت + کلید idempotency) گرفته می‌شود؛
   * ادعای اتمیک ردیف product_import پیش از هر نوشتن محصول؛ نتیجه هر دسته در همان
   * تراکنش محصول ثبت می‌شود؛ تکرار همان کلید یا پخش مجدد ناقص، batch های commit‌شده
   * را دوباره اجرا نمی‌کند. قرارداد §E (ادامه دسته‌های بعدی پس از خطا) حفظ می‌شود.
   */
  async commitImport(
    companyId: string,
    dto: ImportCommitRequest,
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<ImportResult> {
    await this.access.assert(companyId, actorUserId, 'master.product.import');

    const idemKey = createHash('sha256')
      .update(`${dto.mode}\u0000${dto.idempotency_key}\u0000${dto.csv}`)
      .digest('hex');

    // همان درخواستِ همزمان پشت این قفل منتظر میماند و سپس همان گزارش را پخش
    // میکند. import های با کلید متفاوت روی این قفل مسدود نمیشوند.
    return this.creationLock.withKey(`product-import:${companyId}:${idemKey}`, async () => {
      const existing = await this.repo.findImportByIdempotencyKey(companyId, idemKey);
      // A terminal record is always replayed verbatim. Automatic same-key replay of
      // a failed import is never allowed; only an interrupted `processing` record
      // can resume, and only batches with a definitive rolled-back outcome.
      if (existing?.status === 'completed' || existing?.status === 'failed') {
        return this.replayImport(companyId, existing, true);
      }

      const validated = this.validateImport(companyId, dto.csv);
      const totalRows = validated.rows.length;
      const totalBatches = Math.ceil(totalRows / IMPORT_BATCH_SIZE);
      const validationErrorsByRow = new Map<number, ImportRowError[]>();
      for (const error of validated.row_errors) {
        const list = validationErrorsByRow.get(error.row) ?? [];
        list.push(error);
        validationErrorsByRow.set(error.row, list);
      }

      let importId = '';
      if (!existing) {
        const claimed = await this.repo.claimImport({
          companyId,
          idempotencyKey: idemKey,
          mode: dto.mode,
          totalRows,
          createdBy: actorUserId,
        });
        if (!claimed) {
          const raced = await this.repo.findImportByIdempotencyKey(companyId, idemKey);
          if (raced?.status === 'completed' || raced?.status === 'failed') {
            return this.replayImport(companyId, raced, true);
          }
          throw new ConflictException({
            code: 'import_in_progress',
            message_fa: 'اجرای دیگری با همین کلید idempotency در حال پردازش است؛ بعداً تلاش کنید.',
            retryable: true,
            transaction_outcome: 'not_started',
            import_id: raced?.id,
            status: 'processing',
          });
        }
        importId = claimed.id;
      } else {
        importId = existing.id;
        await this.repo.resumeImport(companyId, importId);
      }

      try {
        const codes = validated.rows.map((r) => r.code).filter(Boolean);
        const categoryCodes = [...new Set(validated.rows.map((r) => r.category_code).filter(Boolean))];
        const uomCodes = [...new Set(validated.rows.map((r) => r.base_uom_code).filter(Boolean))];
        const taxCodes = [...new Set(validated.rows.map((r) => r.tax_code).filter(Boolean))];
        const [categories, uoms, taxes, existingByCode, storedBatchesRaw] = await Promise.all([
          this.repo.resolveCategoryCodes(companyId, categoryCodes),
          this.repo.resolveUomCodes(uomCodes),
          this.repo.resolveTaxCodes(companyId, taxCodes),
          this.repo.getProductsForImport(companyId, codes),
          this.repo.listImportBatches(companyId, importId),
        ]);
        // D4 — صفات الزامی در ردیف‌های سازنده (فقط با PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT=enforce؛
        // پیش‌فرض off). CSV مقادیر صفات را حمل نمی‌کند؛ بنابراین در حالت enforce ردیف‌های
        // سازندهٔ کالای جدید row-addressable رد می‌شوند (همان قراردادِ row_errors)؛
        // all-or-nothing هر دسته، continue-after-error (§E) و idempotency دست‌نخورده می‌مانند.
        if (readLifecycleEnforcementMode() === 'enforce' && dto.mode !== 'update') {
          const requiredDefs = await this.repo.listRequiredAttributeDefs(companyId);
          if (requiredDefs.length > 0) {
            const missing = findMissingRequiredAttributes(requiredDefs, new Set<string>());
            const first = missing[0];
            const extra = missing.length > 1 ? ` (+${missing.length - 1} صفتِ الزامیِ دیگر)` : '';
            for (let i = 0; i < validated.rows.length; i += 1) {
              const rowNo = i + 2;
              if (validationErrorsByRow.has(rowNo)) continue;
              const row = validated.rows[i];
              const existingId = row.code ? existingByCode.get(row.code)?.id ?? null : null;
              if (existingId) continue; // کالای موجود: مقادیرش دست‌نخورده می‌ماند (grandfather)
              const list = validationErrorsByRow.get(rowNo) ?? [];
              list.push({
                row: rowNo,
                code: REQUIRED_ATTRIBUTE_MISSING_CODE,
                message_fa: `کالای جدید بدون صفات الزامی ساخته نمی‌شود؛ صفتِ الزامی: «${first.title}»${extra} (PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT=enforce).`,
              });
              validationErrorsByRow.set(rowNo, list);
            }
          }
        }

        const storedBatches = Array.isArray(storedBatchesRaw)
          ? storedBatchesRaw
            .map((raw) => normalizeBatchOutcome(raw, importId))
            .filter((batch): batch is ImportBatchOutcome => batch !== null)
            .sort((a, b) => a.batch_no - b.batch_no)
          : [];
        const byBatchNo = new Map(storedBatches.map((batch) => [batch.batch_no, batch]));
        const outcomes: ImportBatchOutcome[] = [];

        // An unknown transaction outcome is a terminal, operator-review state.
        // Replaying it could duplicate product/history effects if COMMIT had
        // succeeded but its acknowledgement was lost.
        if (storedBatches.some((batch) => batch.transaction_outcome === 'unknown')) {
          await this.repo.markImportFailed({
            companyId,
            importId,
            failureCategory: 'infrastructure',
            retryable: false,
            transactionOutcome: 'unknown',
          }).catch(() => undefined);
          const terminal = await this.repo.getImport(companyId, importId);
          if (!terminal) throw new Error('import_terminal_read_failed');
          return this.replayImport(companyId, terminal, false);
        }

        for (let batchNo = 1; batchNo <= totalBatches; batchNo += 1) {
          const persisted = byBatchNo.get(batchNo);
          const safeToRetry = persisted?.status === 'rolled_back'
            && persisted.transaction_outcome === 'rolled_back'
            && persisted.retryable;
          if (persisted && !safeToRetry) {
            outcomes.push(persisted);
            continue;
          }
          const start = (batchNo - 1) * IMPORT_BATCH_SIZE;
          const outcome = await this.runImportBatch({
            companyId,
            importId,
            actorUserId,
            meta,
            dto,
            batchNo,
            start,
            batch: validated.rows.slice(start, start + IMPORT_BATCH_SIZE),
            categories,
            uoms,
            taxes,
            existingByCode,
            validationErrorsByRow,
          });
          outcomes.push(outcome);
          if (outcome.transaction_outcome === 'unknown') {
            throw new ConflictException({
              code: 'infrastructure_error',
              message_fa: 'نتیجهٔ تراکنش نامشخص است؛ پخش خودکار متوقف شد و نیاز به بررسی اپراتور دارد.',
              retryable: false,
              transaction_outcome: 'unknown',
              import_id: importId,
              status: 'failed',
            });
          }
        }

        outcomes.sort((a, b) => a.batch_no - b.batch_no);
        return await this.finalizeImportRecord({
          companyId,
          importId,
          actorUserId,
          meta,
          totalRows,
          outcomes,
        });
      } catch (err) {
        const failure = classifyImportError(err);
        const current = await this.repo.getImport(companyId, importId).catch(() => null);
        if (current && current.status !== 'completed') {
          await this.repo.markImportFailed({
            companyId,
            importId,
            failureCategory: failure.failure_category,
            retryable: false,
            transactionOutcome: failure.transaction_outcome === 'unknown' ? 'unknown' : 'rolled_back',
          }).catch(() => undefined);
        }
        throw new ConflictException({
          code: failure.code,
          message_fa: failure.message_fa,
          retryable: false,
          transaction_outcome: failure.transaction_outcome,
          import_id: importId,
          status: 'failed',
        });
      }
    });
  }

  private async replayImport(
    companyId: string,
    record: ImportRecord,
    idempotentReplay: boolean,
  ): Promise<ImportResult> {
    const batches = await this.repo.listImportBatches(companyId, record.id);
    return buildImportResult(record, batches, idempotentReplay);
  }

  private async persistBatchOutcome(
    companyId: string,
    actorUserId: string,
    importId: string,
    batch: ImportBatchOutcome,
  ): Promise<ImportBatchOutcome> {
    const persisted = await this.access.write(
      companyId,
      actorUserId,
      'master.product.import',
      async () => this.repo.recordImportBatch({ companyId, importId, batch }),
    );
    // If COMMIT had succeeded but its acknowledgement was lost, the committed
    // marker wins over this ambiguous failure report.
    return normalizeBatchOutcome(persisted, importId) ?? batch;
  }

  private async runImportBatch(args: RunImportBatchArgs): Promise<ImportBatchOutcome> {
    const {
      companyId, importId, actorUserId, meta, dto, batchNo, start, batch,
      categories, uoms, taxes, existingByCode, validationErrorsByRow,
    } = args;
    const batchRows = new Map<number, Record<string, string>>();
    for (let i = 0; i < batch.length; i += 1) batchRows.set(start + i + 2, batch[i]);
    const productContext = (row: Record<string, string>): { product_code?: string; product_id?: string } => ({
      ...(row.code ? { product_code: row.code } : {}),
      ...(existingByCode.get(row.code ?? '')?.id
        ? { product_id: existingByCode.get(row.code ?? '')!.id } : {}),
    });

    const validationIssues: ImportIssue[] = [];
    const validationFailedRows = new Set<number>();
    for (const [rowNo, row] of batchRows) {
      for (const error of validationErrorsByRow.get(rowNo) ?? []) {
        validationIssues.push(importIssue(rowNo, error.code, error.message_fa, {
          batch_no: batchNo,
          import_id: importId,
          status: 'rejected',
          failure_category: 'validation',
          retryable: false,
          transaction_outcome: 'not_started',
          ...productContext(row),
        }));
        validationFailedRows.add(rowNo);
      }
    }
    validationIssues.sort(sortIssues);

    const prepared: PreparedImportRow[] = [];
    let batchError: ImportRowError | null = null;
    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      const rowNo = start + i + 2;
      if (validationErrorsByRow.has(rowNo)) continue;

      const categoryId = categories.get(row.category_code ?? '');
      if (!categoryId) {
        batchError = { row: rowNo, code: 'unknown_category', message_fa: `گروهِ «${row.category_code}» یافت نشد.` };
        break;
      }
      const uomId = uoms.get(row.base_uom_code ?? '');
      if (!uomId) {
        batchError = { row: rowNo, code: 'unknown_uom', message_fa: `واحدِ «${row.base_uom_code}» یافت نشد.` };
        break;
      }
      const taxId = row.tax_code ? taxes.get(row.tax_code) ?? null : null;
      if (row.tax_code && !taxId) {
        batchError = { row: rowNo, code: 'unknown_tax_code', message_fa: `کدِ مالیاتیِ «${row.tax_code}» یافت نشد.` };
        break;
      }
      const existingId = row.code ? existingByCode.get(row.code)?.id ?? null : null;
      if (dto.mode === 'create' && existingId) {
        batchError = { row: rowNo, code: 'duplicate_code', message_fa: `کدِ «${row.code}» قبلاً ثبت شده است (mode=create).` };
        break;
      }
      if (dto.mode === 'update' && !existingId) {
        batchError = { row: rowNo, code: 'not_found', message_fa: `کدِ «${row.code}» برای بروزرسانی یافت نشد (mode=update).` };
        break;
      }
      const sensitiveOnUpdate = existingId && (Boolean(row.tax_code) || Boolean(row.status));
      if (sensitiveOnUpdate && !dto.confirm_sensitive) {
        batchError = {
          row: rowNo,
          code: 'sensitive_change_requires_confirmation',
          message_fa: 'این ردیف فیلدِ حساس (مالیات/وضعیت) را تغییر می‌دهد؛ برای پذیرش باید confirm_sensitive ارسال شود یا ردیف حذف شود.',
        };
        break;
      }
      prepared.push({ rowNo, row, existingId, categoryId, uomId, taxId });
    }

    if (batchError) {
      const classified = classifyDomainCode(batchError.code);
      const rejectedIssues: ImportIssue[] = [];
      for (const [rowNo, row] of batchRows) {
        if (validationFailedRows.has(rowNo)) continue;
        rejectedIssues.push(importIssue(rowNo, batchError.code, `دستهٔ ${batchNo} رد شد: ${batchError.message_fa}`, {
          batch_no: batchNo,
          import_id: importId,
          status: 'rejected',
          failure_category: classified.failure_category,
          retryable: false,
          transaction_outcome: 'not_started',
          ...productContext(row),
        }));
      }
      const report = [...validationIssues, ...rejectedIssues].sort(sortIssues);
      const outcome: ImportBatchOutcome = {
        batch_no: batchNo,
        status: 'rejected',
        transaction_outcome: 'not_started',
        failure_category: classified.failure_category,
        retryable: false,
        reason_code: batchError.code,
        message_fa: `دستهٔ ${batchNo} پیش از تراکنش رد شد: ${batchError.message_fa}`,
        total_rows: batch.length,
        created_rows: 0,
        updated_rows: 0,
        failed_rows: countFailedRows(report),
        attempts: 1,
        report,
      };
      return this.persistBatchOutcome(companyId, actorUserId, importId, outcome);
    }

    if (prepared.length === 0) {
      const reason = validationIssues[0]?.code ?? 'empty_batch';
      const outcome: ImportBatchOutcome = {
        batch_no: batchNo,
        status: 'rejected',
        transaction_outcome: 'not_started',
        failure_category: validationIssues.length > 0 ? 'validation' : 'business',
        retryable: false,
        reason_code: reason,
        message_fa: validationIssues.length > 0
          ? `دستهٔ ${batchNo} به دلیل خطاهای اعتبارسنجی رد شد.`
          : `دستهٔ ${batchNo} ردیف قابل اجرا نداشت.`,
        total_rows: batch.length,
        created_rows: 0,
        updated_rows: 0,
        failed_rows: countFailedRows(validationIssues),
        attempts: 1,
        report: validationIssues,
      };
      return this.persistBatchOutcome(companyId, actorUserId, importId, outcome);
    }

    let attempt = 0;
    let lastFailure: ImportFailure | null = null;
    while (attempt < 3) {
      attempt += 1;
      try {
        const outcome = await this.access.write(companyId, actorUserId, 'master.product.import', async () => {
          const permissions = await this.access.assert(companyId, actorUserId, 'master.product.import');
          const current = await this.repo.getProductsForImportTx(
            companyId,
            prepared.map((p) => p.row.code).filter(Boolean),
          );
          const savedRows: {
            p: PreparedImportRow;
            saved: 'created' | 'updated';
            productId: string;
            productCode: string;
          }[] = [];
          for (const p of prepared) {
            const before = current.get(p.row.code);
            if (dto.mode === 'create' && before) {
              throw new ConflictException({
                code: 'duplicate_code',
                message_fa: `کدِ «${p.row.code}» قبلاً ثبت شده است (mode=create).`,
              });
            }
            if (dto.mode === 'update' && !before) {
              throw new NotFoundException({
                code: 'not_found',
                message_fa: `کدِ «${p.row.code}» برای بروزرسانی یافت نشد (mode=update).`,
              });
            }
            this.guardSensitive(
              before ?? { status: 'active' },
              {
                ...(p.row.status ? { status: p.row.status } : {}),
                ...(before && p.row.base_uom_code ? { base_uom_id: p.uomId } : {}),
                ...(before && p.row.tax_code ? { tax_code_id: p.taxId } : {}),
              },
              dto.confirm_sensitive ?? false,
              permissions.some((code) => permissionMatches(code, 'master.product.status')),
              'ورود گروهی کالا',
            );
            const saved = await this.upsertImportRow(
              companyId,
              { ...p, existingId: before?.id ?? null },
              actorUserId,
              meta,
            );
            savedRows.push({ p, saved: saved.saved, productId: saved.productId, productCode: saved.productCode });
          }

          const successIssues = savedRows.map(({ p, saved, productId, productCode }) =>
            importIssue(p.rowNo, saved, saved === 'created' ? 'کالا ایجاد شد.' : 'کالا بروزرسانی شد.', {
              batch_no: batchNo,
              import_id: importId,
              product_code: productCode || undefined,
              product_id: productId,
              status: saved,
              failure_category: 'none',
              retryable: false,
              transaction_outcome: 'committed',
            }));
          const report = [...validationIssues, ...successIssues].sort(sortIssues);
          const failedRows = countFailedRows(report);
          const batchOutcome: ImportBatchOutcome = {
            batch_no: batchNo,
            status: failedRows > 0 ? 'failed' : 'committed',
            transaction_outcome: 'committed',
            failure_category: failedRows > 0 ? 'validation' : 'none',
            retryable: false,
            ...(failedRows > 0
              ? { reason_code: validationIssues[0]?.code ?? 'partial_batch', message_fa: `دستهٔ ${batchNo}: برخی ردیف‌ها پیش از تراکنش رد شدند؛ سایر ردیف‌ها ثبت شدند.` }
              : {}),
            total_rows: batch.length,
            created_rows: savedRows.filter((r) => r.saved === 'created').length,
            updated_rows: savedRows.filter((r) => r.saved === 'updated').length,
            failed_rows: failedRows,
            attempts: attempt,
            report,
          };
          // همان تراکنش محصول/تاریخچه: بدون این ردیف، commit محصول انجام نمی‌شود.
          await this.repo.recordImportBatch({ companyId, importId, batch: batchOutcome });
          return batchOutcome;
        });
        return outcome;
      } catch (err) {
        lastFailure = classifyImportError(err);
        if (lastFailure.auto_retry && attempt < 3) continue;
        break;
      }
    }

    const failure = lastFailure ?? classifyImportError(new Error('batch_failed'));
    const failureIssues = prepared.map((p) =>
      importIssue(p.rowNo, failure.code, `دستهٔ ${batchNo} ناموفق بود: ${failure.message_fa}`, {
        batch_no: batchNo,
        import_id: importId,
        product_code: p.row.code || undefined,
        product_id: p.existingId ?? undefined,
        status: failure.transaction_outcome === 'unknown' ? 'failed' : 'rolled_back',
        failure_category: failure.failure_category,
        retryable: failure.retryable,
        transaction_outcome: failure.transaction_outcome,
      }));
    const report = [...validationIssues, ...failureIssues].sort(sortIssues);
    const outcome: ImportBatchOutcome = {
      batch_no: batchNo,
      status: failure.transaction_outcome === 'unknown' ? 'failed' : 'rolled_back',
      transaction_outcome: failure.transaction_outcome,
      failure_category: failure.failure_category,
      retryable: failure.retryable,
      reason_code: failure.code,
      message_fa: `دستهٔ ${batchNo} ناموفق بود: ${failure.message_fa}`,
      total_rows: batch.length,
      created_rows: 0,
      updated_rows: 0,
      failed_rows: countFailedRows(report),
      attempts: attempt,
      report,
    };
    // تراکنش شکست‌خورده rollback شده است؛ وضعیت دسته در تراکنش جداگانه‌ای ثبت می‌شود.
    return this.persistBatchOutcome(companyId, actorUserId, importId, outcome);
  }

  private async finalizeImportRecord(args: {
    companyId: string;
    importId: string;
    actorUserId: string;
    meta: RequestMeta;
    totalRows: number;
    outcomes: ImportBatchOutcome[];
  }): Promise<ImportResult> {
    const { companyId, importId, actorUserId, meta, totalRows, outcomes } = args;
    const report = outcomes.flatMap((batch) => batch.report);
    const errors = report.filter((issue) => issue.status !== 'created' && issue.status !== 'updated');
    const failedRows = countFailedRows(report);
    const summary = summarizeImportBatches(outcomes);

    await this.access.write(companyId, actorUserId, 'master.product.import', async () => {
      await this.repo.finalizeImport({
        companyId,
        importId,
        totalRows,
        createdRows: summary.created_rows,
        updatedRows: summary.updated_rows,
        failedRows,
        report,
        failureCategory: summary.failure_category,
        retryable: summary.retryable,
        transactionOutcome: summary.transaction_outcome,
        lastBatchNo: summary.last_batch_no,
      });
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'create',
        entityType: 'product_import',
        entityId: importId,
        after: {
          mode: 'import',
          total: totalRows,
          created: summary.created_rows,
          updated: summary.updated_rows,
          failed: failedRows,
          status: 'completed',
          transaction_outcome: summary.transaction_outcome,
          failure_category: summary.failure_category,
          retryable: summary.retryable,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
    });

    const record = await this.repo.getImport(companyId, importId);
    if (!record) throw new Error('import_finalize_read_failed');
    const batches = await this.repo.listImportBatches(companyId, importId);
    return buildImportResult(record, batches, false);
  }

  async getImport(companyId: string, id: string): Promise<ImportResult> {
    const row = await this.repo.getImport(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'گزارشِ import یافت نشد.' });
    const batches = await this.repo.listImportBatches(companyId, id);
    return buildImportResult(row, batches, false);
  }

  private async upsertImportRow(
    companyId: string,
    p: PreparedImportRow,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<{ saved: 'created' | 'updated'; productId: string; productCode: string }> {
    const r = p.row;
    if (!p.existingId) {
      const code = r.code || (await this.generateSkuCode(companyId));
      const created = await this.repo.insertProductRow({
        companyId,
        code,
        name: r.name || code,
        nameLatin: r.name_latin || null,
        categoryId: p.categoryId,
        uomId: p.uomId,
        taxId: p.taxId,
        minOrderQty: r.min_order_qty ? Number(foldDigits(r.min_order_qty)) : 0,
        weightGr: r.weight_gr ? Number(foldDigits(r.weight_gr)) : null,
        volumeCm3: r.volume_cm3 ? Number(foldDigits(r.volume_cm3)) : null,
        distributionKind: r.distribution_kind || 'both',
        status: r.status || null,
      });
      if (r.barcode) {
        await this.addBarcode(companyId, created.id, { barcode: r.barcode, kind: 'other' }, meta, actorUserId);
      }
      await this.audit.record({
        companyId, actorUserId, action: 'create', entityType: 'product', entityId: created.id,
        after: { code, name: r.name, source: 'import' }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
      });
      return { saved: 'created', productId: created.id, productCode: code };
    }

    const sets: { col: string; value: unknown }[] = [];
    if (r.name) sets.push({ col: 'name', value: r.name });
    if (r.name_latin) sets.push({ col: 'name_latin', value: r.name_latin });
    if (r.category_code) sets.push({ col: 'category_id', value: p.categoryId });
    if (r.base_uom_code) sets.push({ col: 'base_uom_id', value: p.uomId });
    if (r.tax_code) sets.push({ col: 'tax_code_id', value: p.taxId });
    if (r.status) sets.push({ col: 'status', value: r.status });
    if (r.min_order_qty) sets.push({ col: 'min_order_qty', value: Number(foldDigits(r.min_order_qty)) });
    if (r.weight_gr) sets.push({ col: 'weight_gr', value: Number(foldDigits(r.weight_gr)) });
    if (r.volume_cm3) sets.push({ col: 'volume_cm3', value: Number(foldDigits(r.volume_cm3)) });
    if (r.distribution_kind) sets.push({ col: 'distribution_kind', value: r.distribution_kind });
    const ok = await this.repo.updateProductRow(p.existingId, companyId, sets);
    if (!ok) {
      throw new NotFoundException({ code: 'not_found', message_fa: 'کالا برای بروزرسانی یافت نشد.' });
    }
    if (r.barcode) {
      await this.addBarcode(companyId, p.existingId, { barcode: r.barcode, kind: 'other' }, meta, actorUserId);
    }
    await this.audit.record({
      companyId, actorUserId, action: 'update', entityType: 'product', entityId: p.existingId,
      after: { source: 'import', fields: Object.keys(r) }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return { saved: 'updated', productId: p.existingId, productCode: r.code || '' };
  }

  // =================================================================
  // کمکی‌ها
  // =================================================================
  private async assertProduct(companyId: string, productId: string): Promise<{ id: string; code: string; status: string }> {
    const p = await this.repo.productExists(companyId, productId);
    if (!p) throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد.' });
    return p;
  }

  private mapBarcodeDbError(err: unknown): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505') {
      return new ConflictException({
        code: 'duplicate_barcode',
        message_fa:
          'این بارکد قبلاً ثبت شده است (یکتاییِ نوع‌محور: GS1 سراسری، داخلی در هر شرکت).',
        details: { constraint: pgErr.constraint },
      });
    }
    return new BadRequestException({ code: 'barcode_save_failed', message_fa: 'ثبتِ بارکد ناموفق بود.' });
  }

  /** برای serviceهای حساس: تشخیص + نگهبانِ D4 در یک فراخوانی */
  guardSensitive(
    before: { tax_code_id?: string | null; status?: string; base_uom_id?: string },
    after: { tax_code_id?: string | null; status?: string; base_uom_id?: string },
    confirm: boolean,
    hasStatusPermission: boolean,
    action: string,
  ): SensitiveChange[] {
    const changes = detectSensitiveProductChanges(before, after);
    assertSensitiveConfirmed(changes, confirm, hasStatusPermission, action);
    return changes;
  }
}
