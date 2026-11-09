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
  RelationRow,
} from './product-master.repository';
import { ProductMasterRepository } from './product-master.repository';
import type { RequestMeta } from '../../common/request-meta';

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
  async listAliases(companyId: string, productId: string) {
    return this.repo.listAliases(companyId, productId);
  }

  async addAlias(
    companyId: string,
    productId: string,
    alias: string,
    kind: string,
    meta: RequestMeta,
    actorUserId: string,
  ) {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    await this.assertProduct(companyId, productId);
    const aliasNorm = normalizeText(alias);
    if (!aliasNorm) {
      throw new BadRequestException({ code: 'invalid_alias', message_fa: 'مقدارِ alias خالی است.' });
    }
    // alias نباید با کد/بارکدِ موجود برخورد کند (resolution اسکن تک‌معنا بماند — H-1)
    const collisions = await this.repo.findAliasConflicts(companyId, aliasNorm);
    for (const c of collisions) {
      if (c.kind === 'barcode') {
        throw new ConflictException({
          code: 'alias_collision',
          message_fa: 'این alias با بارکدِ ثبت‌شده هم‌ارز است و resolution اسکن را دوپهلو می‌کند.',
          details: { product_id: c.product_id },
        });
      }
      if (c.product_id !== productId && (kind === 'code' || c.kind === 'product_code')) {
        throw new ConflictException({
          code: 'alias_collision',
          message_fa: 'این alias با کد/alias محصولِ دیگری برخورد دارد.',
          details: { product_id: c.product_id },
        });
      }
      if (c.product_id !== productId && c.kind === 'alias') {
        throw new ConflictException({
          code: 'alias_collision',
          message_fa: 'این alias برای محصولِ دیگری ثبت شده است.',
          details: { product_id: c.product_id },
        });
      }
    }
    try {
      const row = await this.repo.insertAlias(companyId, productId, alias, aliasNorm, kind);
      await this.audit.record({
        companyId, actorUserId, action: 'create', entityType: 'product_alias', entityId: row.id,
        after: { product_id: productId, alias, kind }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
      });
      return row;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({ code: 'duplicate_alias', message_fa: 'این alias برای همین کالا قبلاً ثبت شده است.' });
      }
      throw err;
    }

 });
 }

  async removeAlias(companyId: string, id: string, meta: RequestMeta, actorUserId: string): Promise<void> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    const ok = await this.repo.deleteAlias(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'alias یافت نشد.' });
    await this.audit.record({
      companyId, actorUserId, action: 'delete', entityType: 'product_alias', entityId: id,
      ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });

 });
 }

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
    const def = await this.repo.createAttributeDef(companyId, {
      code: d.code, title: d.title, kind: d.kind,
      is_variant_axis: d.is_variant_axis ?? false,
      is_required: d.is_required ?? false,
      sort_order: d.sort_order ?? 0,
    });
    const enumValues: { id: string; value: string }[] = [];
    if (d.kind === 'enum') {
      for (const v of d.enum_values ?? []) {
        enumValues.push(await this.repo.addEnumValue(def.id, v, normalizeAttributeValue('enum', v)));
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
    const row = await this.repo.addEnumValue(defId, value, normalizeAttributeValue('enum', value));
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
  /**
   * خواندنِ مقادیرِ صفاتِ SKU + امضای فعلی (برای نمایش در UI جزئیات)
   */
  async getProductAttributeValues(
    companyId: string,
    productId: string,
  ): Promise<{ values: AttributeValueRow[]; variant_signature: string | null }> {
    await this.assertProduct(companyId, productId);
    const values = await this.repo.listAttributeValues(productId);
    const info = await this.repo.getProductAxisInfo(productId);
    return { values, variant_signature: info?.variant_signature ?? null };
  }

  async setProductAttributeValues(
    companyId: string,
    productId: string,
    values: { def_id: string; value_text?: string | null; value_num?: number | null; value_enum?: string | null }[],
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<{ values: AttributeValueRow[]; variant_signature: string | null }> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    await this.assertProduct(companyId, productId);
    const defs = await this.repo.listAttributeDefs(companyId);
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const info = await this.repo.getProductAxisInfo(productId);
    const hadSignature = Boolean(info?.variant_signature);
    const hasRefs = hadSignature ? await this.repo.productHasOperationalRefs(productId) : false;

    // اعتبارسنجی
    for (const v of values) {
      const def = defMap.get(v.def_id);
      if (!def) {
        throw new BadRequestException({ code: 'invalid_attribute', message_fa: 'صفتِ انتخاب‌شده معتبر نیست.', details: { def_id: v.def_id } });
      }
      const filled = [v.value_text, v.value_num, v.value_enum].filter((x) => x !== null && x !== undefined && x !== '');
      if (filled.length > 1) {
        throw new BadRequestException({ code: 'invalid_attribute_value', message_fa: `برای صفتِ «${def.title}» فقط یک مقدار مجاز است.` });
      }
      if (def.kind === 'number' && v.value_num === undefined) {
        throw new BadRequestException({ code: 'invalid_attribute_value', message_fa: `صفتِ «${def.title}» عددی است.` });
      }
      if (def.kind === 'enum') {
        const allowed = await this.repo.listEnumValues(def.id);
        const norm = normalizeAttributeValue('enum', v.value_enum ?? null);
        if (!allowed.some((a) => a.value_norm === norm)) {
          throw new BadRequestException({
            code: 'invalid_attribute_value',
            message_fa: `مقدارِ «${v.value_enum}» برای صفتِ «${def.title}» در فهرستِ مقادیرِ مجاز نیست.`,
          });
        }
      }
    }

    // الزامِ is_required در سطحِ SKU
    const provided = new Set(values.map((v) => v.def_id));
    for (const def of defs) {
      if (def.is_required && !provided.has(def.id)) {
        const existing = (await this.repo.listAttributeValues(productId)).some((pv) => pv.def_id === def.id);
        if (!existing) {
          throw new BadRequestException({
            code: 'required_attribute_missing',
            message_fa: `صفتِ «${def.title}» برای این کالا الزامی است.`,
          });
        }
      }
    }

    // M-3: اگر امضای قبلی هست و SKU به ارجاعِ عملیاتی رسیده، تغییرِ محورها ممنوع
    const axisIds = new Set(defs.filter((d) => d.is_variant_axis).map((d) => d.id));
    const changesAxis = values.some((v) => axisIds.has(v.def_id));
    if (hasRefs && (changesAxis || values.length === 0)) {
      const changing = values.filter((v) => axisIds.has(v.def_id));
      if (changing.length > 0 || values.length === 0) {
        throw new ConflictException({
          code: 'variant_signature_immutable',
          message_fa:
            'پس از نخستین ارجاعِ عملیاتی (سند/موجودی/قیمت)، محورهای variant تغییرناپذیرند؛ SKU جدید بسازید و SKU قبلی را بازنشسته کنید.',
        });
      }
    }

    const saved: AttributeValueRow[] = [];
    for (const v of values) {
      saved.push(
        await this.repo.upsertAttributeValue({
          productId,
          defId: v.def_id,
          valueText: v.value_text ?? null,
          valueNum: v.value_num != null ? String(v.value_num) : null,
          valueEnum: v.value_enum ?? null,
        }),
      );
    }

    // محاسبهٔ امضای قطعی از محورهای خانواده
    const axisEntries: { defId: string; valueNorm: string }[] = [];
    const allValues = await this.repo.listAttributeValues(productId);
    for (const av of allValues) {
      const def = defMap.get(av.def_id);
      if (!def?.is_variant_axis) continue;
      const raw = av.value_text ?? av.value_enum ?? av.value_num;
      axisEntries.push({ defId: av.def_id, valueNorm: normalizeAttributeValue(def.kind as 'text' | 'number' | 'enum', raw) });
    }
    const signature = axisEntries.length > 0 ? variantSignature(axisEntries) : null;
    try {
      await this.repo.setProductVariantSignature(productId, signature);
    } catch (err) {
      // قیدِ uq_product_variant_signature: ترکیبِ تکراریِ variant در یک خانواده
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'duplicate_variant_signature',
          message_fa: 'ترکیبِ این محورهای variant در همین خانواده قبلاً برای SKU دیگری ثبت شده است.',
        });
      }
      throw err;
    }

    await this.audit.record({
      companyId, actorUserId, action: 'update', entityType: 'product_attribute_value', entityId: productId,
      before: { variant_signature: info?.variant_signature ?? null },
      after: { values: saved, variant_signature: signature },
      ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return { values: saved, variant_signature: signature };

 });
 }

  // =================================================================
  // روابط (جایگزین/مکمل)
  // =================================================================
  async listRelations(companyId: string, productId: string): Promise<RelationRow[]> {
    return this.repo.listRelations(productId);
  }

  async addRelation(
    companyId: string,
    productId: string,
    relatedId: string,
    kind: string,
    priority: number,
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<RelationRow> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    if (!['substitute', 'complement'].includes(kind)) {
      throw new BadRequestException({ code: 'invalid_kind', message_fa: 'نوعِ رابطه باید substitute یا complement باشد.' });
    }
    await this.assertProduct(companyId, productId);
    await this.assertProduct(companyId, relatedId);
    if (productId === relatedId) {
      throw new BadRequestException({ code: 'self_relation', message_fa: 'ارجاعِ خودی در روابط مجاز نیست.' });
    }
    if (kind === 'substitute' && (await this.repo.substitutePathExists(productId, relatedId))) {
      throw new BadRequestException({ code: 'relation_cycle', message_fa: 'این رابطه حلقهٔ جایگزینی ایجاد می‌کند.' });
    }
    try {
      const row = await this.repo.insertRelation(companyId, productId, relatedId, kind, priority);
      await this.audit.record({
        companyId, actorUserId, action: 'create', entityType: 'product_relation', entityId: row.id,
        after: row, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
      });
      return row;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({ code: 'duplicate_relation', message_fa: 'این رابطه قبلاً ثبت شده است.' });
      }
      throw err;
    }

 });
 }

  async removeRelation(companyId: string, id: string, meta: RequestMeta, actorUserId: string): Promise<void> {
 return this.access.write(companyId, actorUserId, 'master.product.update', async () => {
    await this.access.assert(companyId, actorUserId, 'master.product.update');

    const ok = await this.repo.deleteRelation(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'رابطه یافت نشد.' });
    await this.audit.record({
      companyId, actorUserId, action: 'delete', entityType: 'product_relation', entityId: id,
      ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });

 });
 }

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
   */
  async commitImport(
    companyId: string,
    dto: { csv: string; mode: 'create' | 'update' | 'upsert'; idempotency_key: string; confirm_sensitive?: boolean },
    meta: RequestMeta,
    actorUserId: string,
  ): Promise<{
    import_id: string;
    total_rows: number;
    created_rows: number;
    updated_rows: number;
    failed_rows: number;
    errors: { row: number; code: string; message_fa: string }[];
    idempotent_replay: boolean;
  }> {
    await this.access.assert(companyId, actorUserId, 'master.product.import');

    const idemKey = createHash('sha256')
      .update(`${dto.mode}\u0000${dto.idempotency_key}\u0000${dto.csv}`)
      .digest('hex');

    const existing = await this.repo.findImportByIdempotencyKey(companyId, idemKey);
    if (existing) {
      return {
        import_id: existing.id,
        total_rows: existing.total_rows,
        created_rows: existing.created_rows,
        updated_rows: existing.updated_rows,
        failed_rows: existing.failed_rows,
        errors: [],
        idempotent_replay: true,
      };
    }

    const validated = this.validateImport(companyId, dto.csv);
    const errors: { row: number; code: string; message_fa: string }[] = [...validated.row_errors];
    const report: { row: number; status: string; code: string; message_fa: string; product_code?: string }[] =
      validated.row_errors.map((e) => ({ row: e.row, status: 'failed', code: e.code, message_fa: e.message_fa }));

    // حلِ FK با code + تشخیصِ تکرارِ بانک (D2)
    const codes = validated.rows.map((r) => r.code).filter(Boolean);
    const existingByCode = await this.repo.getProductsForImport(companyId, codes);

    const categoryCodes = [...new Set(validated.rows.map((r) => r.category_code).filter(Boolean))];
    const uomCodes = [...new Set(validated.rows.map((r) => r.base_uom_code).filter(Boolean))];
    const taxCodes = [...new Set(validated.rows.map((r) => r.tax_code).filter(Boolean))];
    const [categories, uoms, taxes] = await Promise.all([
      this.repo.resolveCategoryCodes(companyId, categoryCodes),
      this.repo.resolveUomCodes(uomCodes),
      this.repo.resolveTaxCodes(companyId, taxCodes),
    ]);

    let created = 0;
    let updated = 0;
    const BATCH = 100;

    for (let start = 0; start < validated.rows.length; start += BATCH) {
      const batch = validated.rows.slice(start, start + BATCH);
      const batchNo = start / BATCH + 1;
      // همه‌یاهیچ در هر دسته: اگر هر ردیفِ قابلِ قبولی در دسته شکست خورد، کلِ دسته rollback می‌شود
      const prepared: {
        rowNo: number;
        row: Record<string, string>;
        existingId: string | null;
        categoryId: string;
        uomId: string;
        taxId: string | null;
        sensitive: boolean;
      }[] = [];
      let batchError: { row: number; code: string; message_fa: string } | null = null;

      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const rowNo = start + i + 2;
        if (errors.some((e) => e.row === rowNo)) continue; // خطای اعتبارسنجیِ اولیه

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

        // M-5: فیلدِ حساس در ردیفِ import
        const sensitive =
          Boolean(row.tax_code) || Boolean(row.status) || Boolean(row.base_uom_code);
        // base_uom برای create جزئی از تعریف است؛ حساسیت برای «تغییر» است (D4)
        const sensitiveOnUpdate = existingId && (Boolean(row.tax_code) || Boolean(row.status));
        if (sensitiveOnUpdate && !dto.confirm_sensitive) {
          batchError = {
            row: rowNo,
            code: 'sensitive_change_requires_confirmation',
            message_fa:
              'این ردیف فیلدِ حساس (مالیات/وضعیت) را تغییر می‌دهد؛ برای پذیرش باید confirm_sensitive ارسال شود یا ردیف حذف شود.',
          };
          break;
        }

        prepared.push({ rowNo, row, existingId, categoryId, uomId, taxId, sensitive });
      }

      if (batchError) {
        // خرابیِ جزئی ⇒ گزارشِ خطا برای همهٔ ردیف‌های دسته + ادامهٔ دسته‌های بعدی (§E-4)
        const failedRowNos = new Set<number>([batchError.row]);
        for (let i = 0; i < batch.length; i++) {
          const rowNo = start + i + 2;
          if (errors.some((e) => e.row === rowNo)) continue;
          failedRowNos.add(rowNo);
        }
        for (const rowNo of failedRowNos) {
          const e = { row: rowNo, code: batchError.code, message_fa: batchError.message_fa };
          errors.push(e);
          report.push({ row: rowNo, status: 'failed', code: e.code, message_fa: e.message_fa });
        }
        continue;
      }

      // Commit counters/report only after the entire batch has committed.
      try {
        const results = await this.access.write(companyId, actorUserId, 'master.product.import', async () => {
          const permissions = await this.access.assert(companyId, actorUserId, 'master.product.import');
          const current = await this.repo.getProductsForImport(
            companyId,
            prepared.map((p) => p.row.code).filter(Boolean),
          );
          const rows: {
            p: (typeof prepared)[number];
            saved: 'created' | 'updated';
          }[] = [];
          for (const p of prepared) {
            // Recheck under the transaction lock; a concurrent import may have
            // created/removed the code since the pre-transaction lookup.
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
            rows.push({
              p,
              saved: await this.upsertImportRow(companyId, { ...p, existingId: before?.id ?? null }, actorUserId, meta),
            });
          }
          return rows;
        });
        for (const { p, saved } of results) {
          if (saved === 'created') created++;
          else updated++;
          report.push({
            row: p.rowNo,
            status: saved,
            code: saved,
            message_fa: saved === 'created' ? 'کالا ایجاد شد.' : 'کالا بروزرسانی شد.',
            product_code: p.row.code || undefined,
          });
        }
      } catch (err) {
        // Preserve useful, already-public domain codes; never leak raw SQL text.
        const response = (err as { response?: { code?: unknown; message_fa?: unknown } }).response;
        const code = typeof response?.code === 'string' ? response.code : 'batch_failed';
        const detail = typeof response?.message_fa === 'string'
          ? response.message_fa
          : 'خطای سرویس یا پایگاه داده؛ هیچ ردیفی از این دسته ذخیره نشد.';
        const message = `دستهٔ ${batchNo} ناموفق بود: ${detail}`;
        for (const p of prepared) {
          errors.push({ row: p.rowNo, code, message_fa: message });
          report.push({ row: p.rowNo, status: 'failed', code, message_fa: message });
        }
      }
    }

    const failed = new Set(errors.map((e) => e.row)).size;
    const saved = await this.repo.insertImport({
      companyId,
      idempotencyKey: idemKey,
      mode: dto.mode,
      totalRows: validated.rows.length,
      createdRows: created,
      updatedRows: updated,
      failedRows: failed,
      report,
      createdBy: actorUserId,
    });

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'create',
      entityType: 'product_import',
      entityId: saved.id,
      after: { mode: dto.mode, total: validated.rows.length, created, updated, failed },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return {
      import_id: saved.id,
      total_rows: validated.rows.length,
      created_rows: created,
      updated_rows: updated,
      failed_rows: failed,
      errors,
      idempotent_replay: false,
    };
  }

  async getImport(companyId: string, id: string) {
    const row = await this.repo.getImport(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'گزارشِ import یافت نشد.' });
    return row;
  }

  private async upsertImportRow(
    companyId: string,
    p: { rowNo: number; row: Record<string, string>; existingId: string | null; categoryId: string; uomId: string; taxId: string | null },
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<'created' | 'updated'> {
    const r = p.row;
    // آپلودِ ردیف: create/update صریح روی (company_id, code) — بدونِ upsertِ خاموش
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
      return 'created';
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
    await this.repo.updateProductRow(p.existingId, companyId, sets);
    if (r.barcode) {
      await this.addBarcode(companyId, p.existingId, { barcode: r.barcode, kind: 'other' }, meta, actorUserId);
    }
    await this.audit.record({
      companyId, actorUserId, action: 'update', entityType: 'product', entityId: p.existingId,
      after: { source: 'import', fields: Object.keys(r) }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId,
    });
    return 'updated';
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
