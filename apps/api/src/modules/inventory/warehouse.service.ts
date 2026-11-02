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
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './warehouse.dto';
import type { WarehouseRepository, WarehouseRow } from './warehouse.repository';
import { WAREHOUSE_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'انبار یافت نشد' });

/**
 * سرویس انبار — مسیرهای openapi › /warehouses با قواعد DDL (مهاجرت 0008):
 * - شعبه/حوزه/وسیله/انبار والد باید متعلق به شرکت نشست باشند (پیام فارسی پیش از دیتابیس)
 * - کد انبار در شعبه یکتا (uq_warehouse_code)
 * - قید ck_warehouse_vehicle: «kind=vehicle ⟺ vehicle_id مقدار دارد»
 */
@Injectable()
export class WarehouseService {
  constructor(@Inject(WAREHOUSE_REPOSITORY) private readonly repo: WarehouseRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
    }
  }

  /** قید ck_warehouse_vehicle — با حالت ادغام‌شدهٔ به‌روزرسانی سنجیده می‌شود */
  private assertVehicleConsistency(kind: string, vehicleId: string | null | undefined): void {
    const isVehicle = kind === 'vehicle';
    const hasVehicle = Boolean(vehicleId);
    if (isVehicle && !hasVehicle) {
      throw badRequest(
        'vehicle_required',
        'انبار خودرو (kind=vehicle) باید شناسه وسیله نقلیه (vehicle_id) داشته باشد.',
      );
    }
    if (!isVehicle && hasVehicle) {
      throw badRequest(
        'vehicle_not_allowed',
        'فقط انبار خودرو (kind=vehicle) می‌تواند vehicle_id داشته باشد؛ برای انبار دیگر vehicle_id را خالی بگذارید.',
      );
    }
  }

  async list(companyId: string, query: ListWarehousesQueryDto): Promise<Page<WarehouseRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<WarehouseRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreateWarehouseDto): Promise<WarehouseRow> {
    this.assertVehicleConsistency(dto.kind, dto.vehicle_id);
    const branchId = await this.resolveBranch(companyId, dto.branch_id);
    await this.validateReferences(companyId, dto);

    let id: string;
    try {
      id = await this.repo.insert(companyId, dto, branchId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateWarehouseDto): Promise<WarehouseRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();

    // بررسی قید خودرو روی حالت ادغام‌شده (فیلدهای نیامده از ردیف فعلی می‌آیند)
    const mergedKind = dto.kind ?? before.kind;
    const mergedVehicle = dto.vehicle_id !== undefined ? dto.vehicle_id : before.vehicle_id;
    this.assertVehicleConsistency(mergedKind, mergedVehicle);

    await this.validateReferences(companyId, dto);
    if (dto.branch_id && !(await this.repo.branchExists(companyId, dto.branch_id))) {
      throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
    }

    let updated: string | null;
    try {
      updated = await this.repo.update(companyId, id, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    if (!updated) {
      // سطر پیش‌تر یافت شده؛ نبودِ نتیجهٔ UPDATE یعنی مغایرت نسخه (قفل خوش‌بینانه)
      if (dto.row_version !== undefined) {
        throw new ConflictException({
          code: 'version_conflict',
          message_fa: 'انبار هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
        });
      }
      throw notFound();
    }
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

  /** اعتبارسنجی ارجاع‌های موجود در بدنه (فیلدهای نیامده سنجیده نمی‌شوند) */
  private async validateReferences(companyId: string, dto: Partial<CreateWarehouseDto>): Promise<void> {
    if (dto.parent_warehouse_id && !(await this.repo.warehouseExists(companyId, dto.parent_warehouse_id))) {
      throw badRequest('parent_warehouse_not_found', 'انبار والد انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.vehicle_id && !(await this.repo.vehicleExists(dto.vehicle_id))) {
      throw badRequest('vehicle_not_found', 'وسیله نقلیه انتخاب‌شده یافت نشد.');
    }
    if (dto.area_id && !(await this.repo.areaExists(companyId, dto.area_id))) {
      throw badRequest('area_not_found', 'حوزه فروش انتخاب‌شده در این شرکت یافت نشد.');
    }
  }

  private mapDbError(err: unknown): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_warehouse_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد انبار برای این شعبه قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
      });
    }
    if (pgErr?.code === '23505') {
      // ایندکس یکتای vehicle_id — هر وسیله فقط یک انبار خودرو دارد
      return new ConflictException({
        code: 'duplicate_vehicle',
        message_fa: 'این وسیله نقلیه قبلاً به‌عنوان انبار خودرو ثبت شده است.',
        details: { constraint: pgErr.constraint },
      });
    }
    if (pgErr?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (pgErr?.code === '23514' && pgErr.constraint === 'ck_warehouse_vehicle') {
      return badRequest(
        'vehicle_required',
        'قید انبار خودرو رعایت نشده؛ kind=vehicle و vehicle_id باید همراه هم باشند.',
      );
    }
    if (pgErr?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    return badRequest('warehouse_save_failed', 'خطای غیرمنتظره در ذخیره انبار.');
  }
}
