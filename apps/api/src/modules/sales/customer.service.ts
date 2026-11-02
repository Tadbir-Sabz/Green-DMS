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
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
  UpdateLocationDto,
} from './customer.dto';
import type { CustomerRepository, CustomerRow } from './customer.repository';
import { CUSTOMER_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'مشتری یافت نشد' });

/**
 * سرویس مشتریان — مسیرهای openapi › /customers با قواعد DDL (مهاجرت 0007):
 * - person/شعبه/حوزه/مسیر/ویزیتور/لیست قیمت/تسویه باید متعلق به شرکت نشست باشند
 *   (بررسی با پیام فارسی پیش از رسیدن به دیتابیس، نه خطای کلید خارجی)
 * - کد مشتری در شعبه یکتا (uq_customer_code) و هر شخص فقط یک ردیف مشتری
 * - geo با [طول، عرض] می‌آید و محدوده مختصات سنجیده می‌شود؛ قید ck_customer_geo
 *   منشأ و زمان ثبت را همراه مختصات می‌خواهد (در repository ست می‌شود)
 * - credit_limit در customer_credit ذخیره/به‌روزرسانی می‌شود
 */
@Injectable()
export class CustomerService {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly repo: CustomerRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
    }
  }

  /** محدوده طول/عرض جغرافیایی — با details.fields همان ساختار خطای اعتبارسنجی سراسری */
  private assertGeo(geo: { coordinates: [number, number] } | null | undefined): void {
    if (!geo) return;
    const [lng, lat] = geo.coordinates;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new BadRequestException({
        code: 'invalid_geo',
        message_fa: 'مختصات جغرافیایی خارج از محدوده مجاز است؛ طول بین ۱۸۰- تا ۱۸۰+ و عرض بین ۹۰- تا ۹۰+ باشد.',
        details: { fields: { geo: ['مختصات [طول، عرض] را در محدوده مجاز وارد کنید.'] } },
      });
    }
  }

  async list(companyId: string, query: ListCustomersQueryDto): Promise<Page<CustomerRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<CustomerRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreateCustomerDto, userId: string): Promise<CustomerRow> {
    this.assertGeo(dto.geo);
    const branchId = await this.resolveBranch(companyId, dto.branch_id);
    await this.validateReferences(companyId, dto);

    let id: string;
    try {
      id = await this.repo.insert(companyId, dto, branchId, userId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateCustomerDto,
    userId: string,
  ): Promise<CustomerRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();
    this.assertGeo(dto.geo);
    await this.validateReferences(companyId, dto);

    let updated: string | null;
    try {
      updated = await this.repo.update(companyId, id, dto, userId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    if (!updated) {
      // سطر پیش‌تر یافت شده؛ نبودِ نتیجهٔ UPDATE یعنی مغایرت نسخه (قفل خوش‌بینانه)
      if (dto.row_version !== undefined) {
        throw new ConflictException({
          code: 'version_conflict',
          message_fa: 'مشتری هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
        });
      }
      throw notFound();
    }
    return this.get(companyId, id);
  }

  /** PUT /customers/{id}/location — ثبت/تصحیح موقعیت توسط فروشنده در نقشه */
  async setLocation(
    companyId: string,
    id: string,
    dto: UpdateLocationDto,
    userId: string,
  ): Promise<CustomerRow> {
    this.assertId(id);
    this.assertGeo(dto.geo);
    const updated = await this.repo.setLocation(companyId, id, dto, userId);
    if (!updated) throw notFound();
    return this.get(companyId, id);
  }

  /** شعبه اگر نیامده باشد شعبه پیش‌فرض شرکت (ستون branch_id NOT NULL است) */
  private async resolveBranch(companyId: string, branchId?: string): Promise<string> {
    if (branchId) {
      if (!(await this.repo.branchExists(companyId, branchId))) {
        throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
      }
      return branchId;
    }
    const fallback = await this.repo.defaultBranchId(companyId);
    if (!fallback) {
      throw badRequest('branch_missing', 'شرکت نشست شعبه‌ای ندارد؛ ابتدا شعبه تعریف کنید.');
    }
    return fallback;
  }

  /** اعتبارسنجی همه ارجاع‌های موجود در بدنه (فیلدهای نیامده سنجیده نمی‌شوند) */
  private async validateReferences(
    companyId: string,
    dto: Partial<CreateCustomerDto>,
  ): Promise<void> {
    if (dto.person_id && !(await this.repo.personExists(companyId, dto.person_id))) {
      throw badRequest('person_not_found', 'شخص اشاره‌شده در این شرکت یافت نشد.');
    }
    if (dto.area_id && !(await this.repo.areaExists(companyId, dto.area_id))) {
      throw badRequest('area_not_found', 'حوزه فروش انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.route_id && !(await this.repo.routeExists(companyId, dto.route_id))) {
      throw badRequest('route_not_found', 'مسیر انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.salesperson_id && !(await this.repo.staffExists(companyId, dto.salesperson_id))) {
      throw badRequest('salesperson_not_found', 'ویزیتور انتخاب‌شده پرسنل معتبری در این شرکت نیست.');
    }
    if (dto.price_list_id && !(await this.repo.priceListExists(companyId, dto.price_list_id))) {
      throw badRequest('price_list_not_found', 'لیست قیمت انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.settlement_term_id && !(await this.repo.settlementTermExists(companyId, dto.settlement_term_id))) {
      throw badRequest('settlement_term_not_found', 'شرط تسویه انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.branch_id && !(await this.repo.branchExists(companyId, dto.branch_id))) {
      throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
    }
  }

  private mapDbError(err: unknown): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_customer_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد مشتری برای این شعبه قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
      });
    }
    if (pgErr?.code === '23505') {
      return new ConflictException({
        code: 'duplicate_person',
        message_fa: 'این شخص قبلاً به‌عنوان مشتری ثبت شده است؛ هر شخص فقط یک ردیف مشتری دارد.',
        details: { constraint: pgErr.constraint },
      });
    }
    if (pgErr?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (pgErr?.code === '23514') {
      if (pgErr.constraint === 'ck_customer_geo') {
        return badRequest(
          'geo_source_required',
          'برای ثبت موقعیت، منشأ (geo_source) مشخص نیست؛ gps یا map_pick را انتخاب کنید.',
        );
      }
      return badRequest(
        'check_violation',
        'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست (کانال، وضعیت یا سقف اعتبار را بررسی کنید).',
      );
    }
    return badRequest('customer_save_failed', 'خطای غیرمنتظره در ذخیره مشتری.');
  }
}
