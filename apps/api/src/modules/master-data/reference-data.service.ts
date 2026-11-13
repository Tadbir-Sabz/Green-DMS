import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import type { RequestMeta } from '../../common/request-meta';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';
import { CatalogAccess } from './catalog-access.service';
import {
  BRAND_LIST_QUERY_KEYS,
  CATEGORY_DELETE_QUERY_KEYS,
  CATEGORY_LIST_QUERY_KEYS,
  HISTORY_QUERY_KEYS,
  REFERENCE_DUPLICATE_CODES,
  REFERENCE_ENTITY_TYPES,
  REFERENCE_IN_USE_CODES,
  REFERENCE_LABELS_FA,
  REFERENCE_MAX_DEPTH,
  UOM_DECIMAL_MAX,
  UNIT_LIST_QUERY_KEYS,
  clampLimit,
  clampOffset,
  isValidDecimalPlaces,
  normalizeReferenceCode,
  normalizeText,
  parseIsActive,
  unknownQueryKeys,
  wouldCreateCycle,
  type ReferenceEntityType,
} from './reference-data.rules';
import {
  ReferenceDataRepository,
  type BrandRow,
  type CategoryRow,
  type ListOptions,
  type ListResult,
  type UnitRow,
} from './reference-data.repository';

export interface CreateBrandInput {
  code: string; name: string; name_latin?: string | null; is_active?: boolean;
}
export interface UpdateBrandInput {
  code?: string; name?: string; name_latin?: string | null; is_active?: boolean;
}
export interface CreateUnitInput {
  code: string; title: string; symbol?: string | null; title_latin?: string | null;
  decimal_places?: number; is_active?: boolean;
}
export interface UpdateUnitInput {
  title?: string; symbol?: string | null; title_latin?: string | null;
  decimal_places?: number; is_active?: boolean;
}
export interface CreateCategoryInput {
  code: string; name: string; name_latin?: string | null;
  parent_id?: string | null; is_active?: boolean;
}
export interface UpdateCategoryInput {
  code?: string; name?: string; name_latin?: string | null;
  parent_id?: string | null; is_active?: boolean;
}

const MAX_Q = 128;

/**
 * سرویس «مدیریت دادههای مرجع» (TASK-PM-02-C2).
 *
 * مرزها:
 *  - RBAC عادی §F: خواندن با master.product.view، نوشتن با master.product.update؛
 *    دوباره در لایهٔ سرویس از روی DB (CatalogAccess) بازاعتبارسنجی میشود.
 *    هیچ مجوز تازهای ساخته/seed نشد.
 *  - brand/product_category شرکتمحور + RLS موجود ۰۰۴۱؛ uom مرجع سراسری
 *    (بدون company_id، طبق قرارداد ۰۰۰۵) — هیچ دادهٔ شرکتمحوری از uom نشت نمیکند.
 *  - ممیزی fail-closed (recordRequired) در همان تراکنش نوشتن؛ شکست ممیزی ⇒ rollback.
 *  - DomainBoundaryGuard روی همهٔ مسیرها: هیچ domain_id/عضویت/دسترسپذیری
 *    دامنهای پذیرفته یا ساخته نمیشود؛ پارامترهای ناشناخته بیصدا حذف نمیشوند.
 *  - تبدیل واحد/ضریب/گردکردن دستنخورده است (D3، decimal_places ۰..۴ موجود).
 */
@Injectable()
export class ReferenceDataService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    private readonly access: CatalogAccess,
    private readonly repo: ReferenceDataRepository,
  ) {}

  // ───────────────────────── کمکتابعهای مشترک ─────────────────────────

  private unsupportedQuery(raw: Record<string, unknown>, allowed: readonly string[]): void {
    const keys = unknownQueryKeys(raw, allowed);
    if (keys.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_query_parameter',
        message_fa: `پارامتر(های) پشتیبانی\u200cنشده: ${keys.join('، ')}.`,
        details: { fields: keys },
      });
    }
  }

  private listOptions(
    raw: Record<string, unknown>,
    allowed: readonly string[],
    withParent: boolean,
  ): ListOptions {
    this.unsupportedQuery(raw, allowed);
    const q = raw.q === undefined || raw.q === null || raw.q === '' ? null : String(raw.q).trim();
    if (q !== null && q.length > MAX_Q) {
      throw new BadRequestException({ code: 'invalid_query', message_fa: 'عبارت جست\u200cوجو بیش از حد طولانی است.' });
    }
    const isActive = parseIsActive(raw.is_active);
    if (isActive === undefined) {
      throw new BadRequestException({ code: 'invalid_is_active', message_fa: 'مقدار is_active باید true یا false باشد.' });
    }
    const limit = this.boundedInt(raw.limit, 'limit', 1, 200, 50);
    const offset = this.boundedInt(raw.offset, 'offset', 0, 100000, 0);
    let parentId: string | null = null;
    let rootOnly = false;
    if (withParent) {
      if (raw.parent_id !== undefined && raw.parent_id !== null && raw.parent_id !== '') {
        if (!isUUID(String(raw.parent_id), '4')) {
          throw new BadRequestException({ code: 'invalid_parent_id', message_fa: 'شناسهٔ والد معتبر نیست.' });
        }
        parentId = String(raw.parent_id);
      }
      if (raw.root !== undefined && raw.root !== null && raw.root !== '') {
        if (raw.root !== 'true' && raw.root !== 'false') {
          throw new BadRequestException({ code: 'invalid_root', message_fa: 'مقدار root باید true یا false باشد.' });
        }
        rootOnly = raw.root === 'true';
      }
    }
    return {
      q: q === null || q.length === 0 ? null : q,
      isActive,
      limit: clampLimit(limit),
      offset: clampOffset(offset),
      parentId,
      rootOnly,
    };
  }

  private boundedInt(raw: unknown, field: string, min: number, max: number, fallback: number): number {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
      throw new BadRequestException({
        code: `invalid_${field}`,
        message_fa: `مقدار «${field}» باید عدد صحیح معتبر باشد.`,
      });
    }
    return n;
  }

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسهٔ درخواست\u200cشده معتبر نیست.' });
    }
  }

  private async read(companyId: string, userId: string): Promise<void> {
    await this.access.assert(companyId, userId, 'master.product.view');
  }

  private async auditWrite(
    user: AuthContext,
    action: 'create' | 'update' | 'delete',
    entityType: ReferenceEntityType,
    entityId: string,
    before: unknown,
    after: unknown,
    meta: RequestMeta,
  ): Promise<void> {
    await this.audit.recordRequired({
      companyId: user.companyId,
      actorUserId: user.userId,
      action,
      entityType,
      entityId,
      before,
      after,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  /** نگاشت خطاهای پایگاهداده به پیام فارسی پایدار (بدون افشای SQL). */
  private mapDbError(err: unknown, entity: ReferenceEntityType): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505') {
      const c = e.constraint ?? '';
      const isName = c.includes('name');
      const label = REFERENCE_LABELS_FA[entity];
      return new ConflictException({
        code: REFERENCE_DUPLICATE_CODES[entity],
        message_fa: isName
          ? `نام این ${label} قبلاً ثبت شده است؛ نام دیگری انتخاب کنید.`
          : `کد این ${label} قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.`,
      });
    }
    if (e?.code === '23503') {
      return new ConflictException({
        code: REFERENCE_IN_USE_CODES[entity],
        message_fa: `این ${REFERENCE_LABELS_FA[entity]} توسط داده\u200cهای دیگر استفاده می\u200cشود و قابل حذف نیست؛ می\u200cتوانید آن را غیرفعال کنید.`,
      });
    }
    if (e?.code === '23514') {
      return new BadRequestException({
        code: 'check_violation',
        message_fa: 'مقادیر ارسالی با قیود پایگاه\u200cداده (دقت اعشار/قالب) سازگار نیست.',
      });
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  private optionalLatin(raw: string | null | undefined): string | null {
    if (raw === undefined || raw === null) return null;
    const v = normalizeText(String(raw));
    return v.length === 0 ? null : v.slice(0, 255);
  }

  // ─────────────────────────────── برند ───────────────────────────────

  async listBrands(user: AuthContext, raw: Record<string, unknown>): Promise<ListResult<BrandRow>> {
    await this.read(user.companyId, user.userId);
    return this.repo.listBrands(user.companyId, this.listOptions(raw, BRAND_LIST_QUERY_KEYS, false));
  }

  async getBrand(user: AuthContext, id: string) {
    await this.read(user.companyId, user.userId);
    this.assertId(id);
    const row = await this.repo.findBrand(user.companyId, id);
    if (!row) throw new NotFoundException({ code: 'brand_not_found', message_fa: 'برند یافت نشد.' });
    const usage = await this.repo.brandUsage(user.companyId, id);
    return { ...row, usage_count: usage.count, products: usage.products };
  }

  async createBrand(user: AuthContext, input: CreateBrandInput, meta: RequestMeta): Promise<BrandRow> {
    const code = normalizeReferenceCode('brand', input.code);
    if (!code) throw new BadRequestException({ code: 'invalid_brand_code', message_fa: 'کد برند معتبر نیست (فقط حروف/اعداد لاتین، نقطه، خطتیره، زیرخط؛ حداکثر ۶۴ نویسه).' });
    const name = normalizeText(input.name ?? '');
    if (!name || name.length > 255) throw new BadRequestException({ code: 'invalid_brand_name', message_fa: 'نام برند الزامی و حداکثر ۲۵۵ نویسه است.' });

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      try {
        const row = await this.repo.insertBrand(user.companyId, {
          code, name, name_latin: this.optionalLatin(input.name_latin), is_active: input.is_active ?? true,
        });
        await this.auditWrite(user, 'create', 'brand', row.id, null, row, meta);
        return row;
      } catch (err) { throw this.mapDbError(err, 'brand'); }
    });
  }

  async updateBrand(user: AuthContext, id: string, input: UpdateBrandInput, meta: RequestMeta): Promise<BrandRow> {
    this.assertId(id);
    const patch: UpdateBrandInput = {};
    if (input.code !== undefined) {
      const code = normalizeReferenceCode('brand', input.code);
      if (!code) throw new BadRequestException({ code: 'invalid_brand_code', message_fa: 'کد برند معتبر نیست.' });
      patch.code = code;
    }
    if (input.name !== undefined) {
      const name = normalizeText(input.name);
      if (!name || name.length > 255) throw new BadRequestException({ code: 'invalid_brand_name', message_fa: 'نام برند معتبر نیست.' });
      patch.name = name;
    }
    if (input.name_latin !== undefined) patch.name_latin = this.optionalLatin(input.name_latin);
    if (input.is_active !== undefined) {
      if (typeof input.is_active !== 'boolean') throw new BadRequestException({ code: 'invalid_is_active', message_fa: 'وضعیت فعال باید true یا false باشد.' });
      patch.is_active = input.is_active;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException({ code: 'no_changes', message_fa: 'هیچ تغییری ارسال نشده است.' });

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      const before = await this.repo.findBrand(user.companyId, id);
      if (!before) throw new NotFoundException({ code: 'brand_not_found', message_fa: 'برند یافت نشد.' });
      try {
        const row = await this.repo.updateBrand(user.companyId, id, patch);
        if (!row) throw new NotFoundException({ code: 'brand_not_found', message_fa: 'برند یافت نشد.' });
        await this.auditWrite(user, 'update', 'brand', id, before, row, meta);
        return row;
      } catch (err) {
        if (err instanceof NotFoundException) throw err;
        throw this.mapDbError(err, 'brand');
      }
    });
  }

  async deleteBrand(user: AuthContext, id: string, meta: RequestMeta): Promise<{ deleted: boolean; message_fa: string }> {
    this.assertId(id);
    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      const before = await this.repo.findBrand(user.companyId, id);
      if (!before) throw new NotFoundException({ code: 'brand_not_found', message_fa: 'برند یافت نشد.' });
      const usage = await this.repo.brandUsage(user.companyId, id);
      if (usage.count > 0) {
        throw new ConflictException({
          code: 'brand_in_use',
          message_fa: `این برند به ${usage.count} کالا متصل است و حذف آن ناامن است؛ به\u200cجای حذف، آن را غیرفعال کنید.`,
          details: { product_count: usage.count },
        });
      }
      try {
        const ok = await this.repo.deleteBrand(user.companyId, id);
        if (!ok) throw new NotFoundException({ code: 'brand_not_found', message_fa: 'برند یافت نشد.' });
        await this.auditWrite(user, 'delete', 'brand', id, before, null, meta);
        return { deleted: true, message_fa: 'برند حذف شد.' };
      } catch (err) {
        if (err instanceof NotFoundException || err instanceof ConflictException) throw err;
        throw this.mapDbError(err, 'brand');
      }
    });
  }

  // ─────────────────────────────── واحد ───────────────────────────────

  async listUnits(user: AuthContext, raw: Record<string, unknown>): Promise<ListResult<UnitRow>> {
    await this.read(user.companyId, user.userId);
    return this.repo.listUnits(user.companyId, this.listOptions(raw, UNIT_LIST_QUERY_KEYS, false));
  }

  async getUnit(user: AuthContext, id: string) {
    await this.read(user.companyId, user.userId);
    this.assertId(id);
    const row = await this.repo.findUnit(user.companyId, id);
    if (!row) throw new NotFoundException({ code: 'unit_not_found', message_fa: 'واحد اندازه\u200cگیری یافت نشد.' });
    const usage = await this.repo.unitUsage(user.companyId, id);
    return { ...row, usage_count: usage.count, products: usage.products };
  }

  async createUnit(user: AuthContext, input: CreateUnitInput, meta: RequestMeta): Promise<UnitRow> {
    const code = normalizeReferenceCode('unit', input.code);
    if (!code) throw new BadRequestException({ code: 'invalid_unit_code', message_fa: 'کد واحد معتبر نیست (حروف کوچک لاتین/اعداد/زیرخط؛ حداکثر ۱۶ نویسه، همسو با واحدهای موجود).' });
    const title = normalizeText(input.title ?? '');
    if (!title || title.length > 64) throw new BadRequestException({ code: 'invalid_unit_title', message_fa: 'عنوان واحد الزامی و حداکثر ۶۴ نویسه است.' });
    const decimals = input.decimal_places ?? 0;
    if (!isValidDecimalPlaces(decimals)) {
      throw new BadRequestException({ code: 'invalid_decimal_places', message_fa: `دقت اعشار باید عدد صحیح بین ۰ و ${UOM_DECIMAL_MAX} باشد (مصوب D3).` });
    }
    const symbol = this.optionalLatin(input.symbol);
    if (symbol && symbol.length > 16) throw new BadRequestException({ code: 'invalid_unit_symbol', message_fa: 'نماد واحد حداکثر ۱۶ نویسه است.' });

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      try {
        const row = await this.repo.insertUnit({
          code, title, symbol, title_latin: this.optionalLatin(input.title_latin),
          decimal_places: decimals, is_active: input.is_active ?? true,
        });
        await this.auditWrite(user, 'create', 'uom', row.id, null, row, meta);
        return row;
      } catch (err) { throw this.mapDbError(err, 'uom'); }
    });
  }

  async updateUnit(user: AuthContext, id: string, input: UpdateUnitInput & { code?: string }, meta: RequestMeta): Promise<UnitRow> {
    this.assertId(id);
    if (input.code !== undefined) {
      throw new BadRequestException({ code: 'unit_code_immutable', message_fa: 'کد واحد پس از ایجاد تغییرناپذیر است؛ import/export و اسناد بر اساس کد واحد به آن ارجاع می\u200cدهند.' });
    }
    const patch: UpdateUnitInput = {};
    if (input.title !== undefined) {
      const title = normalizeText(input.title);
      if (!title || title.length > 64) throw new BadRequestException({ code: 'invalid_unit_title', message_fa: 'عنوان واحد معتبر نیست.' });
      patch.title = title;
    }
    if (input.symbol !== undefined) {
      const symbol = this.optionalLatin(input.symbol);
      if (symbol && symbol.length > 16) throw new BadRequestException({ code: 'invalid_unit_symbol', message_fa: 'نماد واحد حداکثر ۱۶ نویسه است.' });
      patch.symbol = symbol;
    }
    if (input.title_latin !== undefined) patch.title_latin = this.optionalLatin(input.title_latin);
    if (input.decimal_places !== undefined) {
      if (!isValidDecimalPlaces(input.decimal_places)) throw new BadRequestException({ code: 'invalid_decimal_places', message_fa: `دقت اعشار باید عدد صحیح بین ۰ و ${UOM_DECIMAL_MAX} باشد (مصوب D3).` });
      patch.decimal_places = input.decimal_places;
    }
    if (input.is_active !== undefined) {
      if (typeof input.is_active !== 'boolean') throw new BadRequestException({ code: 'invalid_is_active', message_fa: 'وضعیت فعال باید true یا false باشد.' });
      patch.is_active = input.is_active;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException({ code: 'no_changes', message_fa: 'هیچ تغییری ارسال نشده است.' });

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      const before = await this.repo.findUnit(user.companyId, id);
      if (!before) throw new NotFoundException({ code: 'unit_not_found', message_fa: 'واحد اندازه\u200cگیری یافت نشد.' });
      try {
        const row = await this.repo.updateUnit(user.companyId, id, patch);
        if (!row) throw new NotFoundException({ code: 'unit_not_found', message_fa: 'واحد اندازه\u200cگیری یافت نشد.' });
        await this.auditWrite(user, 'update', 'uom', id, before, row, meta);
        return row;
      } catch (err) {
        if (err instanceof NotFoundException) throw err;
        throw this.mapDbError(err, 'uom');
      }
    });
  }

  async deleteUnit(user: AuthContext, id: string, meta: RequestMeta): Promise<{ deleted: boolean; message_fa: string }> {
    this.assertId(id);
    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      const before = await this.repo.findUnit(user.companyId, id);
      if (!before) throw new NotFoundException({ code: 'unit_not_found', message_fa: 'واحد اندازه\u200cگیری یافت نشد.' });
      const usage = await this.repo.unitUsage(user.companyId, id);
      if (usage.count > 0) {
        throw new ConflictException({
          code: 'unit_in_use',
          message_fa: `این واحد توسط ${usage.count} کالا/بسته\u200cبندی استفاده می\u200cشود و حذف آن ناامن است؛ به\u200cجای حذف، آن را غیرفعال کنید.`,
          details: { usage_count: usage.count },
        });
      }
      try {
        const ok = await this.repo.deleteUnit(id);
        if (!ok) throw new NotFoundException({ code: 'unit_not_found', message_fa: 'واحد اندازه\u200cگیری یافت نشد.' });
        await this.auditWrite(user, 'delete', 'uom', id, before, null, meta);
        return { deleted: true, message_fa: 'واحد اندازه\u200cگیری حذف شد.' };
      } catch (err) {
        if (err instanceof NotFoundException || err instanceof ConflictException) throw err;
        throw this.mapDbError(err, 'uom');
      }
    });
  }

  // ───────────────────────────── دستهبندی ─────────────────────────────

  async listCategories(user: AuthContext, raw: Record<string, unknown>): Promise<ListResult<CategoryRow>> {
    await this.read(user.companyId, user.userId);
    return this.repo.listCategories(user.companyId, this.listOptions(raw, CATEGORY_LIST_QUERY_KEYS, true));
  }

  async getCategory(user: AuthContext, id: string) {
    await this.read(user.companyId, user.userId);
    this.assertId(id);
    const row = await this.repo.findCategory(user.companyId, id);
    if (!row) throw new NotFoundException({ code: 'category_not_found', message_fa: 'دسته\u200cبندی یافت نشد.' });
    const [ancestors, children, products] = await Promise.all([
      this.repo.ancestorsOf(user.companyId, id),
      this.repo.directChildren(user.companyId, id),
      this.repo.categoryProducts(user.companyId, id),
    ]);
    // child_count / product_count از همان ردیف لیست میآیند (شمارشهای امن).
    return { ...row, ancestors, children, products };
  }

  private async assertParent(
    companyId: string,
    categoryId: string | null,
    parentId: string | null | undefined,
  ): Promise<void> {
    if (parentId === undefined || parentId === null) return;
    if (!(await this.repo.activeCategoryExists(companyId, parentId))) {
      throw new BadRequestException({
        code: 'invalid_parent_id',
        message_fa: 'دسته\u200cبندی والد در این شرکت یافت نشد یا غیرفعال است؛ دستهٔ فعالی انتخاب کنید.',
      });
    }
    const ancestors = await this.repo.ancestorsOf(companyId, parentId);
    if (categoryId && wouldCreateCycle(categoryId, parentId, ancestors.map((a) => a.id))) {
      throw new ConflictException({
        code: 'category_cycle',
        message_fa: 'انتساب این والد یک حلقه در سلسله\u200cمراتب ایجاد می\u200cکند؛ دسته نمی\u200cتواند والد خود یا یکی از نوادگانش باشد.',
      });
    }
    if (ancestors.length + 1 > REFERENCE_MAX_DEPTH) {
      throw new BadRequestException({ code: 'category_depth_exceeded', message_fa: 'عمق سلسله\u200cمراتب بیش از حد مجاز است.' });
    }
  }

  async createCategory(user: AuthContext, input: CreateCategoryInput, meta: RequestMeta): Promise<CategoryRow> {
    const code = normalizeReferenceCode('category', input.code);
    if (!code) throw new BadRequestException({ code: 'invalid_category_code', message_fa: 'کد دسته\u200cبندی معتبر نیست (فقط حروف/اعداد لاتین، نقطه، خطتیره، زیرخط؛ حداکثر ۶۴ نویسه).' });
    const name = normalizeText(input.name ?? '');
    if (!name || name.length > 255) throw new BadRequestException({ code: 'invalid_category_name', message_fa: 'نام دسته\u200cبندی الزامی و حداکثر ۲۵۵ نویسه است.' });
    const parentId = input.parent_id ?? null;
    if (parentId !== null && !isUUID(parentId, '4')) throw new BadRequestException({ code: 'invalid_parent_id', message_fa: 'شناسهٔ والد معتبر نیست.' });

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      await this.assertParent(user.companyId, null, parentId);
      try {
        const row = await this.repo.insertCategory(user.companyId, {
          code, name, name_latin: this.optionalLatin(input.name_latin),
          parent_id: parentId, is_active: input.is_active ?? true,
        });
        await this.auditWrite(user, 'create', 'product_category', row.id, null, row, meta);
        return row;
      } catch (err) {
        if (err instanceof BadRequestException || err instanceof ConflictException) throw err;
        throw this.mapDbError(err, 'product_category');
      }
    });
  }

  async updateCategory(user: AuthContext, id: string, input: UpdateCategoryInput, meta: RequestMeta): Promise<CategoryRow> {
    this.assertId(id);
    const patch: UpdateCategoryInput = {};
    if (input.code !== undefined) {
      const code = normalizeReferenceCode('category', input.code);
      if (!code) throw new BadRequestException({ code: 'invalid_category_code', message_fa: 'کد دسته\u200cبندی معتبر نیست.' });
      patch.code = code;
    }
    if (input.name !== undefined) {
      const name = normalizeText(input.name);
      if (!name || name.length > 255) throw new BadRequestException({ code: 'invalid_category_name', message_fa: 'نام دسته\u200cبندی معتبر نیست.' });
      patch.name = name;
    }
    if (input.name_latin !== undefined) patch.name_latin = this.optionalLatin(input.name_latin);
    if (input.parent_id !== undefined) {
      if (input.parent_id !== null && !isUUID(input.parent_id, '4')) throw new BadRequestException({ code: 'invalid_parent_id', message_fa: 'شناسهٔ والد معتبر نیست.' });
      patch.parent_id = input.parent_id;
    }
    if (input.is_active !== undefined) {
      if (typeof input.is_active !== 'boolean') throw new BadRequestException({ code: 'invalid_is_active', message_fa: 'وضعیت فعال باید true یا false باشد.' });
      patch.is_active = input.is_active;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException({ code: 'no_changes', message_fa: 'هیچ تغییری ارسال نشده است.' });

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      const before = await this.repo.findCategory(user.companyId, id);
      if (!before) throw new NotFoundException({ code: 'category_not_found', message_fa: 'دسته\u200cبندی یافت نشد.' });
      if (patch.parent_id !== undefined) await this.assertParent(user.companyId, id, patch.parent_id);
      try {
        const row = await this.repo.updateCategory(user.companyId, id, patch);
        if (!row) throw new NotFoundException({ code: 'category_not_found', message_fa: 'دسته\u200cبندی یافت نشد.' });
        await this.auditWrite(user, 'update', 'product_category', id, before, row, meta);
        return row;
      } catch (err) {
        if (err instanceof NotFoundException || err instanceof BadRequestException || err instanceof ConflictException) throw err;
        throw this.mapDbError(err, 'product_category');
      }
    });
  }

  async deleteCategory(
    user: AuthContext,
    id: string,
    raw: Record<string, unknown>,
    meta: RequestMeta,
  ): Promise<{ deleted: boolean; message_fa: string; reassigned?: { children: number; products: number } }> {
    this.assertId(id);
    this.unsupportedQuery(raw, CATEGORY_DELETE_QUERY_KEYS);
    const targetId = raw.reassign_to === undefined || raw.reassign_to === null || raw.reassign_to === ''
      ? null
      : String(raw.reassign_to);
    if (targetId !== null) {
      if (!isUUID(targetId, '4')) throw new BadRequestException({ code: 'invalid_reassign_to', message_fa: 'شناسهٔ مقصد انتساب معتبر نیست.' });
      if (targetId === id) throw new BadRequestException({ code: 'invalid_reassign_to', message_fa: 'مقصد انتساب نمیتواند همان دسته باشد.' });
    }

    return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
      const before = await this.repo.findCategory(user.companyId, id);
      if (!before) throw new NotFoundException({ code: 'category_not_found', message_fa: 'دسته\u200cبندی یافت نشد.' });
      const usage = await this.repo.categoryUsage(user.companyId, id);
      if (targetId !== null) {
        if (!(await this.repo.activeCategoryExists(user.companyId, targetId))) {
          throw new BadRequestException({
            code: 'invalid_reassign_to',
            message_fa: 'دسته\u200cبندی مقصد در این شرکت یافت نشد یا غیرفعال است؛ دستهٔ فعالی انتخاب کنید.',
          });
        }
        const targetAncestors = await this.repo.ancestorsOf(user.companyId, targetId);
        if (wouldCreateCycle(id, targetId, targetAncestors.map((a) => a.id))) {
          throw new ConflictException({ code: 'category_cycle', message_fa: 'انتساب به یکی از نوادگان همان دسته مجاز نیست (حلقه در سلسلهمراتب).' });
        }
        const moved = await this.repo.reassignCategoryChildren(user.companyId, id, targetId);
        await this.auditWrite(user, 'update', 'product_category', id, before,
          { reassign_to: targetId, moved_children: moved.children, moved_products: moved.products }, meta);
      } else if (usage.children > 0 || usage.products > 0) {
        throw new ConflictException({
          code: 'category_in_use',
          message_fa: `این دسته ${usage.children} زیردسته و ${usage.products} کالا دارد؛ ابتدا آنها را به دستهای دیگر منتقل کنید (reassign_to) یا دسته را غیرفعال کنید.`,
          details: { child_count: usage.children, product_count: usage.products },
        });
      }
      try {
        const ok = await this.repo.deleteCategory(user.companyId, id);
        if (!ok) throw new NotFoundException({ code: 'category_not_found', message_fa: 'دسته\u200cبندی یافت نشد.' });
        await this.auditWrite(user, 'delete', 'product_category', id,
          targetId !== null ? { reassign_to: targetId } : before, null, meta);
        return {
          deleted: true,
          message_fa: targetId !== null ? 'دسته با انتساب ایمن وابستگان حذف شد.' : 'دسته\u200cبندی حذف شد.',
          ...(targetId !== null ? { reassigned: usage } : {}),
        };
      } catch (err) {
        if (err instanceof NotFoundException || err instanceof ConflictException) throw err;
        throw this.mapDbError(err, 'product_category');
      }
    });
  }

  // ───────────────────────────── تاریخچه ─────────────────────────────

  async history(user: AuthContext, raw: Record<string, unknown>) {
    await this.read(user.companyId, user.userId);
    this.unsupportedQuery(raw, HISTORY_QUERY_KEYS);
    let entityType: string | null = null;
    if (raw.entity_type !== undefined && raw.entity_type !== null && raw.entity_type !== '') {
      const value = String(raw.entity_type);
      if (!(REFERENCE_ENTITY_TYPES as readonly string[]).includes(value)) {
        throw new BadRequestException({ code: 'invalid_entity_type', message_fa: 'نوع موجودیت تاریخچه معتبر نیست.' });
      }
      entityType = value;
    }
    let entityId: string | null = null;
    if (raw.entity_id !== undefined && raw.entity_id !== null && raw.entity_id !== '') {
      if (!isUUID(String(raw.entity_id), '4')) throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسهٔ موجودیت معتبر نیست.' });
      entityId = String(raw.entity_id);
    }
    const limit = this.boundedInt(raw.limit, 'limit', 1, 100, 30);
    const offset = this.boundedInt(raw.offset, 'offset', 0, 100000, 0);
    const { items, total } = await this.repo.history(
      user.companyId,
      entityType ? [entityType] : [...REFERENCE_ENTITY_TYPES],
      entityId,
      limit,
      offset,
    );
    return { items, total, limit, offset };
  }
}
