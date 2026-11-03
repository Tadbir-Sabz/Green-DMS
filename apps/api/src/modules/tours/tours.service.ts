import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { TourRow, ToursRepository, TourSettlementRow, VisitRow } from './tours.repository';
import { TOURS_REPOSITORY, VISITS_REPOSITORY } from './tokens';
import type {
  CreateTourDto,
  CreateVisitDto,
  ListToursQueryDto,
  ListVisitsQueryDto,
  UpdateTourDto,
  UpdateVisitDto,
} from './tours.dto';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

/** فاصلهٔ تقریبی دو نقطه بر حسب متر (haversine) — برای سنجش ضدتقلب check-in */
const haversineMeters = (a: number[], b: number[]): number => {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
};

/** شعاع مجاز فاصلهٔ check-in از موقعیت ثبت‌شدهٔ مشتری (متر) — فراتر = دور زده */
const MAX_VISIT_DISTANCE_M = 500;

/**
 * سرویس تور (ماژول ۵) — CRUD تور + تسویه. تور با doc_number از number_counter
 * ساخته می‌شود و وضعیت از planned شروع می‌شود.
 */
@Injectable()
export class ToursService {
  constructor(@Inject(TOURS_REPOSITORY) private readonly repo: ToursRepository) {}

  private assertId(id: string, msg: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', msg);
  }

  async list(companyId: string, query: ListToursQueryDto): Promise<Page<TourRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listTours(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<TourRow> {
    this.assertId(id, 'شناسهٔ تور معتبر نیست.');
    const row = await this.repo.findTour(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'تور یافت نشد.' });
    return row;
  }

  async create(companyId: string, dto: CreateTourDto): Promise<TourRow> {
    const branchId = await this.repo.salespersonBranch(companyId, dto.salesperson_id);
    if (!branchId) {
      throw badRequest('salesperson_not_found', 'فروشندهٔ انتخاب‌شده در این شرکت یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insertTour(companyId, dto, branchId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateTourDto): Promise<TourRow> {
    this.assertId(id, 'شناسهٔ تور معتبر نیست.');
    const existing = await this.repo.findTour(companyId, id);
    if (!existing) throw new NotFoundException({ code: 'not_found', message_fa: 'تور یافت نشد.' });
    // شروع پیش از پایان — همان قید ck_tour_times ولی با پیام فارسی
    const startedAt = dto.started_at ?? existing.started_at;
    const endedAt = dto.ended_at ?? existing.ended_at;
    if (startedAt && endedAt && new Date(endedAt) < new Date(startedAt)) {
      throw badRequest('invalid_times', 'زمان پایان تور نمی‌تواند پیش از زمان شروع باشد.');
    }
    try {
      await this.repo.updateTour(companyId, id, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async settlement(companyId: string, id: string): Promise<TourSettlementRow> {
    this.assertId(id, 'شناسهٔ تور معتبر نیست.');
    const tour = await this.repo.findTour(companyId, id);
    if (!tour) throw new NotFoundException({ code: 'not_found', message_fa: 'تور یافت نشد.' });
    const row = await this.repo.tourSettlement(companyId, id);
    return (
      row ?? {
        tour_id: id,
        expected_cash: null,
        received_cash: null,
        variance_amount: null,
        commission_total: null,
        status: 'open',
      }
    );
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_tour') {
      return new ConflictException({
        code: 'duplicate_tour',
        message_fa: 'برای این فروشنده در همین تاریخ و نوع، تور ثبت شده است.',
      });
    }
    if (e?.code === '23505') {
      return new ConflictException({ code: 'duplicate', message_fa: 'تور تکراری است.' });
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های تور معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای تور مجاز نیست.');
    }
    return badRequest('tour_save_failed', 'خطای غیرمنتظره در ثبت تور.');
  }
}

/**
 * سرویس بازدید (ماژول ۵) — check-in/out با سنجش فاصلهٔ ضدتقلب. اگر فاصلهٔ
 * مختصات ارسالی از موقعیت ثبت‌شدهٔ مشتری بیش از حد مجاز باشد، distance_m ثبت و
 * بازدید با پیام مناسب رد می‌شود (ماژول ۶ رویداد ضدتقلب را تکمیل می‌کند).
 */
@Injectable()
export class VisitsService {
  constructor(@Inject(VISITS_REPOSITORY) private readonly repo: ToursRepository) {}

  private assertId(id: string, msg: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', msg);
  }

  async list(companyId: string, query: ListVisitsQueryDto): Promise<Page<VisitRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listVisits(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<VisitRow> {
    this.assertId(id, 'شناسهٔ بازدید معتبر نیست.');
    const row = await this.repo.findVisit(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'بازدید یافت نشد.' });
    return row;
  }

  async create(companyId: string, dto: CreateVisitDto): Promise<VisitRow> {
    if (!(await this.repo.tourBelongsToCompany(companyId, dto.tour_id))) {
      throw badRequest('tour_not_found', 'تور انتخاب‌شده در این شرکت یافت نشد.');
    }
    // idempotency آفلاین — client_uuid تکراری یعنی همان بازدید قبلی (409)
    if (dto.client_uuid && (await this.repo.visitClientUuidExists(dto.client_uuid))) {
      throw new ConflictException({
        code: 'duplicate_client',
        message_fa: 'بازدید با این کلید همگام‌سازی قبلاً ثبت شده است.',
      });
    }
    const geoIn = dto.geo_in?.coordinates ?? null;
    let distanceM: number | null = null;
    if (geoIn) {
      const customerGeo = await this.repo.customerGeo(companyId, dto.customer_id);
      if (customerGeo) {
        distanceM = haversineMeters(geoIn, customerGeo);
        if (distanceM > MAX_VISIT_DISTANCE_M) {
          throw new ConflictException({
            code: 'visit_too_far',
            message_fa: `فاصلهٔ شما تا موقعیت مشتری ${distanceM} متر است؛ بازدید ثبت نشد.`,
            details: { distance_m: distanceM },
          });
        }
      }
    }
    let id: string;
    try {
      id = await this.repo.insertVisit(dto, geoIn, distanceM);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateVisitDto): Promise<VisitRow> {
    this.assertId(id, 'شناسهٔ بازدید معتبر نیست.');
    const existing = await this.repo.findVisit(companyId, id);
    if (!existing) throw new NotFoundException({ code: 'not_found', message_fa: 'بازدید یافت نشد.' });
    if (dto.result && (dto.result === 'no_order' || dto.result === 'closed') && !dto.no_order_reason) {
      // علت فقط برای بازدید بی‌نتیجه لازم است (نه سخت‌گیرانه؛ قرارداد اختیاری کرده)
    }
    const checkout = dto.check_out_at ?? existing.check_out_at;
    if (existing.check_in_at && checkout && new Date(checkout) < new Date(existing.check_in_at)) {
      throw badRequest('invalid_times', 'زمان پایان بازدید نمی‌تواند پیش از شروع باشد.');
    }
    try {
      await this.repo.updateVisit(companyId, id, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_visit_client') {
      return new ConflictException({
        code: 'duplicate_client',
        message_fa: 'بازدید با این کلید همگام‌سازی قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'تور یا مشتری انتخاب‌شده معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای بازدید مجاز نیست.');
    }
    return badRequest('visit_save_failed', 'خطای غیرمنتظره در ثبت بازدید.');
  }
}
