import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
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
  constructor(@Inject(PRICING_REPOSITORY) private readonly repo: PricingRepository) {}

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

  async createPriceList(companyId: string, dto: CreatePriceListDto): Promise<PriceListView> {
    await this.validateItems(companyId, dto.items);
    let id: string;
    try {
      id = await this.repo.insertPriceList(companyId, dto);
    } catch (err) {
      throw this.mapPriceListError(err);
    }
    return this.getPriceList(companyId, id);
  }

  async updatePriceList(companyId: string, id: string, dto: UpdatePriceListDto): Promise<PriceListView> {
    this.assertId(id, 'لیست قیمت');
    await this.validateItems(companyId, dto.items);
    try {
      const updated = await this.repo.updatePriceList(companyId, id, dto);
      if (!updated) throw notFound('لیست قیمت');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapPriceListError(err);
    }
    return this.getPriceList(companyId, id);
  }

  private async validateItems(
    companyId: string,
    items?: { product_id: string; price: string }[],
  ): Promise<void> {
    for (const item of items ?? []) {
      if (!(await this.repo.productExists(companyId, item.product_id))) {
        throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');
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

  async createPromotion(companyId: string, dto: CreatePromotionDto): Promise<PromotionView> {
    let id: string;
    try {
      id = await this.repo.insertPromotion(companyId, dto);
    } catch (err) {
      throw this.mapPromotionError(err);
    }
    return this.getPromotion(companyId, id);
  }

  async updatePromotion(companyId: string, id: string, dto: UpdatePromotionDto): Promise<PromotionView> {
    this.assertId(id, 'تشویق');
    try {
      const updated = await this.repo.updatePromotion(companyId, id, dto);
      if (!updated) throw notFound('تشویق');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapPromotionError(err);
    }
    return this.getPromotion(companyId, id);
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
