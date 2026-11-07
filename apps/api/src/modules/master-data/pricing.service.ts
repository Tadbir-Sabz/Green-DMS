import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import { PRICING_ENGINE_SERVICE } from '../pricing/pricing.tokens';
import type { PricingEngineService } from '../pricing/pricing-engine.service';
import type {
  CreatePriceListDto,
  CreatePromotionDto,
  ListPriceListsQueryDto,
  ListPromotionsQueryDto,
  UpdatePriceListDto,
  UpdatePromotionDto,
} from './pricing.dto';
import type {
  PriceListItemRow,
  PriceListRow,
  PricingRepository,
  PromotionRow,
} from './pricing.repository';
import { PRICING_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (what: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: `${what} یافت نشد` });

export interface PriceListView extends PriceListRow {
  items: PriceListItemRow[];
}

/** valid_to ممکن است null (بازهٔ باز) باشد و در قرارداد type string (غیرnullable) است → حذف می‌شود */
export type PromotionView = Omit<PromotionRow, 'valid_to'> & { valid_to?: string };

const toPromotionView = (row: PromotionRow): PromotionView => {
  const { valid_to, ...rest } = row;
  return valid_to != null ? { ...rest, valid_to } : { ...rest };
};

@Injectable()
export class PricingService {
  constructor(
    @Inject(PRICING_REPOSITORY) private readonly repo: PricingRepository,
    /**
     * موتورِ قیمت — برای اعتبارسنجیِ کفِ سود و تعریفِ تشویق و ثبتِ ممیزی در همان
     * نقطهٔ نوشتن. قیمتِ زیرِ کفِ سود بدونِ استثنای تأییدشده ذخیره نمی‌شود.
     */
    @Inject(PRICING_ENGINE_SERVICE) private readonly engine: PricingEngineService,
  ) {}

  private assertId(id: string, what: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', `شناسه ${what} ارسال‌شده معتبر نیست.`);
  }

  // ---------------- لیست قیمت ----------------

  async listPriceLists(companyId: string, query: ListPriceListsQueryDto): Promise<Page<PriceListRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listPriceLists(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async getPriceList(companyId: string, id: string): Promise<PriceListView> {
    this.assertId(id, 'لیست قیمت');
    const row = await this.repo.findPriceList(companyId, id);
    if (!row) throw notFound('لیست قیمت');
    const items = await this.repo.findPriceListItems(id);
    return { ...row, items };
  }

  async createPriceList(companyId: string, dto: CreatePriceListDto, actorUserId: string | null = null): Promise<PriceListView> {
    this.validateTiers(dto.items);
    await this.validateItems(companyId, dto.items);
    await this.assertMarginForItems(companyId, actorUserId, dto.items);
    let id: string;
    try {
      id = await this.repo.insertPriceList(companyId, dto);
    } catch (err) {
      throw this.mapPriceListError(err);
    }
    await this.engine.logPriceChange({
      companyId,
      actorUserId,
      entityType: 'price_list',
      entityId: id,
      action: 'create',
      before: null,
      after: { ...dto, items: dto.items?.map((i) => ({ ...i })) },
    });
    return this.getPriceList(companyId, id);
  }

  async updatePriceList(companyId: string, id: string, dto: UpdatePriceListDto, actorUserId: string | null = null): Promise<PriceListView> {
    this.assertId(id, 'لیست قیمت');
    const before = await this.repo.findPriceList(companyId, id);
    if (!before) throw notFound('لیست قیمت');
    this.validateTiers(dto.items);
    await this.validateItems(companyId, dto.items);
    await this.assertMarginForItems(companyId, actorUserId, dto.items);
    try {
      const updated = await this.repo.updatePriceList(companyId, id, dto);
      if (!updated) {
        if (dto.row_version !== undefined) {
          throw new ConflictException({
            code: 'version_conflict',
            message_fa: 'لیست قیمت هم‌زمان توسط کاربرِ دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
          });
        }
        throw notFound('لیست قیمت');
      }
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException) throw err;
      throw this.mapPriceListError(err);
    }
    await this.engine.logPriceChange({
      companyId,
      actorUserId,
      entityType: 'price_list',
      entityId: id,
      action: 'update',
      before,
      after: dto,
    });
    return this.getPriceList(companyId, id);
  }

  private async validateItems(
    companyId: string,
    items?: { product_id: string; packaging_id?: string | null; price: string; min_qty?: string; max_qty?: string | null }[],
  ): Promise<void> {
    for (const item of items ?? []) {
      if (!(await this.repo.productExists(companyId, item.product_id))) {
        throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');
      }
      if (item.packaging_id) {
        const ok = await this.repo.packagingBelongsToProduct(item.product_id, item.packaging_id);
        if (!ok) throw badRequest('packaging_not_found', 'بسته‌بندیِ انتخاب‌شده برای این کالا یافت نشد.');
      }
    }
  }

  /** اعتبارسنجیِ سطوحِ تعدادی در سطحِ ورودی (DB هم قید دارد؛ این‌جا پیامِ فارسیِ دقیق) */
  private validateTiers(
    items?: { min_qty?: string; max_qty?: string | null }[],
  ): void {
    for (const item of items ?? []) {
      const min = item.min_qty == null ? 0 : Number(item.min_qty);
      const max = item.max_qty == null ? null : Number(item.max_qty);
      if (!Number.isFinite(min) || min < 0) {
        throw badRequest('invalid_tier', 'حداقلِ تعدادِ سطح باید عددِ غیرمنفی باشد.');
      }
      if (max != null && (!Number.isFinite(max) || max <= min)) {
        throw badRequest('invalid_tier', 'سقفِ تعدادِ سطح باید بزرگ‌تر از حداقلِ آن باشد.');
      }
    }
  }

  /**
   * کفِ سود در زمانِ نوشتنِ قیمت — هر قلم با سیاستِ مؤثرِ همان شرکت.
   * نقض ⇒ 409 margin_floor_violation با دلیلِ صریح (بدونِ ذخیرهٔ نیمه‌کاره).
   */
  private async assertMarginForItems(
    companyId: string,
    actorUserId: string | null,
    items?: {
      product_id: string;
      packaging_id?: string | null;
      price: string;
      min_qty?: string;
      max_qty?: string | null;
      max_discount_pct?: string | null;
      valid_from?: string | null;
      margin_exception_id?: string | null;
    }[],
  ): Promise<void> {
    for (const item of items ?? []) {
      const margin = await this.engine.assertMarginForPriceWrite({
        companyId,
        productId: item.product_id,
        packagingId: item.packaging_id ?? null,
        price: item.price,
        customerId: null,
        pricingDate: (item.valid_from ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
        marginExceptionId: item.margin_exception_id ?? null,
      });
      if (margin.status === 'exception_applied') {
        await this.engine.logPriceChange({
          companyId,
          actorUserId,
          entityType: 'price_list_item',
          entityId: null,
          action: 'margin_exception_applied',
          before: null,
          after: { product_id: item.product_id, price: item.price, margin },
        });
      }
    }
  }

  private mapPriceListError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_price_list_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد لیست قیمت برای این شرکت قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23P01') {
      // قید انحصاری ex_price_list_item (همپوشانی بازه برای یک کالا)
      return new ConflictException({
        code: 'overlapping_item',
        message_fa: 'برای این کالا قیمتی با بازهٔ همپوشان از قبل ثبت شده است.',
      });
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    return badRequest('price_list_save_failed', 'خطای غیرمنتظره در ذخیره لیست قیمت.');
  }

  // ---------------- تشویق ----------------

  async listPromotions(companyId: string, query: ListPromotionsQueryDto): Promise<Page<PromotionView>> {
    const { items, nextCursor, hasMore } = await this.repo.listPromotions(companyId, query);
    return { items: items.map(toPromotionView), next_cursor: nextCursor, has_more: hasMore };
  }

  async getPromotion(companyId: string, id: string): Promise<PromotionView> {
    this.assertId(id, 'تشویق');
    const row = await this.repo.findPromotion(companyId, id);
    if (!row) throw notFound('تشویق');
    return toPromotionView(row);
  }

  async createPromotion(companyId: string, dto: CreatePromotionDto, actorUserId: string | null = null): Promise<PromotionView> {
    this.engine.validatePromotion(dto.kind, dto.conditions, dto.benefit);
    await this.validatePromotionRefs(companyId, dto);
    let id: string;
    try {
      id = await this.repo.insertPromotion(companyId, dto);
    } catch (err) {
      throw this.mapPromotionError(err);
    }
    await this.engine.logPriceChange({
      companyId,
      actorUserId,
      entityType: 'promotion',
      entityId: id,
      action: 'create',
      before: null,
      after: dto,
    });
    return this.getPromotion(companyId, id);
  }

  async updatePromotion(companyId: string, id: string, dto: UpdatePromotionDto, actorUserId: string | null = null): Promise<PromotionView> {
    this.assertId(id, 'تشویق');
    const before = await this.repo.findPromotion(companyId, id);
    if (!before) throw notFound('تشویق');
    // تعریفِ نهایی (پس از merge) اعتبارسنجی می‌شود تا PATCH جزئی هم شرطِ ناقص نسازد
    const kind = dto.kind ?? (before.kind as CreatePromotionDto['kind']);
    const conditions = (dto.conditions ?? before.conditions ?? {}) as Record<string, unknown>;
    const benefit = (dto.benefit ?? before.benefit ?? {}) as Record<string, unknown>;
    // PATCH: تعریفِ نهایی (پس از merge) اعتبارسنجی می‌شود تا شرطِ ناقص ساخته نشود
    this.engine.validatePromotion(kind, conditions, benefit);
    await this.validatePromotionRefs(companyId, { ...dto, conditions, benefit });
    try {
      const updated = await this.repo.updatePromotion(companyId, id, dto);
      if (!updated) throw notFound('تشویق');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapPromotionError(err);
    }
    await this.engine.logPriceChange({
      companyId,
      actorUserId,
      entityType: 'promotion',
      entityId: id,
      action: 'update',
      before,
      after: dto,
    });
    return this.getPromotion(companyId, id);
  }

  /**
   * ارجاع‌های تشویق: قلمرو باید متعلق به همین شرکت باشد و کالاهای شرط/هدیه موجود.
   * (جلوگیری از «تشویقِ بین‌اجاره‌ای» با شناسهٔ قلمرو/کالای شرکتِ دیگر.)
   */
  private async validatePromotionRefs(
    companyId: string,
    dto: { domain_id?: string | null; conditions?: Record<string, unknown>; benefit?: Record<string, unknown> },
  ): Promise<void> {
    if (dto.domain_id) {
      const domain = await this.repo.domainExists(companyId, dto.domain_id);
      if (!domain) throw badRequest('domain_not_found', 'قلمروِ انتخاب‌شده در این شرکت یافت نشد.');
    }
    const ids = new Set<string>();
    const push = (v: unknown): void => {
      if (typeof v === 'string' && isUUID(v, '4')) ids.add(v);
      else if (Array.isArray(v)) v.forEach(push);
    };
    const c = dto.conditions ?? {};
    push(c.product_ids);
    push((c.buy_x as Record<string, unknown> | undefined)?.product_id);
    push((c.bundle as Record<string, unknown> | undefined)?.product_ids);
    push((dto.benefit?.gift as Record<string, unknown> | undefined)?.product_id);
    push(dto.benefit?.get_product_id);
    for (const productId of ids) {
      if (!(await this.repo.productExists(companyId, productId))) {
        throw badRequest('product_not_found', 'یکی از کالاهای ارجاع‌شده در تشویق در این شرکت یافت نشد.');
      }
    }
  }

  private mapPromotionError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_promotion_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد تشویق برای این شرکت قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    if (e?.code === '23502') {
      return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
    }
    return badRequest('promotion_save_failed', 'خطای غیرمنتظره در ذخیره تشویق.');
  }
}
