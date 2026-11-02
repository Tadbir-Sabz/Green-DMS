import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './staff.dto';
import type { StaffRepository, StaffRow } from './staff.repository';
import { STAFF_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'پرسنل یافت نشد' });

/**
 * سرویس پرسنل — مسیرهای openapi › /staff با قواعد DDL (مهاجرت 0004) و 0026:
 * - person/سمت/شعبه/سرپرست/وسیله/حوزه همه باید متعلق به شرکت نشست باشند
 *   (بررسی با پیام فارسی پیش از رسیدن به دیتابیس، نه خطای کلید خارجی)
 * - job_position_id NOT NULL است پس job_position_code در ساخت الزامی می‌شود
 * - status قرارداد دو حالت دارد؛ نگاشت دوطرفه با سه‌حالت DB در repository است
 * - area_ids (حوزه‌های مجاز کار) در جدول staff_area نگهداری و جایگزین می‌شود
 */
@Injectable()
export class StaffService {
  constructor(@Inject(STAFF_REPOSITORY) private readonly repo: StaffRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
    }
  }

  async list(companyId: string, query: ListStaffQueryDto): Promise<Page<StaffRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<StaffRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreateStaffDto): Promise<StaffRow> {
    const { branchId, jobPositionId } = await this.resolveReferences(companyId, dto);

    if (dto.supervisor_id && !(await this.repo.staffExists(companyId, dto.supervisor_id))) {
      throw badRequest('supervisor_not_found', 'سرپرست انتخاب‌شده پرسنل معتبری در این شرکت نیست.');
    }
    if (dto.vehicle_id && !(await this.repo.vehicleExists(companyId, dto.vehicle_id))) {
      throw badRequest('vehicle_not_found', 'وسیله نقلیه انتخاب‌شده در این شرکت یافت نشد.');
    }

    let id: string;
    try {
      id = await this.repo.insert(dto, branchId, jobPositionId);
    } catch (err) {
      throw this.mapDbError(err);
    }

    if (dto.area_ids) await this.repo.replaceAreas(id, dto.area_ids);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async update(companyId: string, id: string, dto: UpdateStaffDto): Promise<StaffRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();

    // قید ck_staff_no_self_supervisor: سرپرست نمی‌تواند خودِ همان پرسنل باشد
    if (dto.supervisor_id && dto.supervisor_id === id) {
      throw badRequest('supervisor_self', 'پرسنل نمی‌تواند سرپرست خودش باشد.');
    }
    if (dto.person_id && dto.person_id !== before.person_id) {
      if (!(await this.repo.personExists(companyId, dto.person_id))) {
        throw badRequest('person_not_found', 'شخص اشاره‌شده در این شرکت یافت نشد.');
      }
    }
    if (dto.supervisor_id && !(await this.repo.staffExists(companyId, dto.supervisor_id))) {
      throw badRequest('supervisor_not_found', 'سرپرست انتخاب‌شده پرسنل معتبری در این شرکت نیست.');
    }
    if (dto.vehicle_id && !(await this.repo.vehicleExists(companyId, dto.vehicle_id))) {
      throw badRequest('vehicle_not_found', 'وسیله نقلیه انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.area_ids && !(await this.repo.areasBelongTo(companyId, dto.area_ids))) {
      throw badRequest('area_not_found', 'یکی از حوزه‌های انتخاب‌شده در این شرکت یافت نشد.');
    }

    let jobPositionId: string | undefined;
    if (dto.job_position_code !== undefined) {
      jobPositionId = await this.jobPositionId(companyId, dto.job_position_code);
    }

    let updated: string | null;
    try {
      updated = await this.repo.update(companyId, id, dto, jobPositionId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    if (!updated) {
      // سطر پیش‌تر یافت شده؛ نبودِ نتیجهٔ UPDATE یعنی مغایرت نسخه (قفل خوش‌بینانه)
      if (dto.row_version !== undefined) {
        throw new ConflictException({
          code: 'version_conflict',
          message_fa: 'پرسنل هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
        });
      }
      throw notFound();
    }

    if (dto.area_ids !== undefined) await this.repo.replaceAreas(id, dto.area_ids);
    return this.get(companyId, id);
  }

  /** شعبه و سمتِ معتبرِ همین شرکت — شعبه اگر نیامده باشد شعبه پیش‌فرض گرفته می‌شود */
  private async resolveReferences(
    companyId: string,
    dto: CreateStaffDto,
  ): Promise<{ branchId: string; jobPositionId: string }> {
    if (!dto.job_position_code) {
      throw badRequest('job_position_required', 'سمت شغلی (job_position_code) برای پرسنل الزامی است.');
    }
    const personOk = await this.repo.personExists(companyId, dto.person_id);
    if (!personOk) {
      throw badRequest('person_not_found', 'شخص اشاره‌شده در این شرکت یافت نشد.');
    }

    const jobPositionId = await this.jobPositionId(companyId, dto.job_position_code);

    let branchId: string | null;
    if (dto.branch_id) {
      branchId = (await this.repo.branchExists(companyId, dto.branch_id))
        ? dto.branch_id
        : null;
      if (!branchId) throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
    } else {
      branchId = await this.repo.defaultBranchId(companyId);
      if (!branchId) {
        throw badRequest('branch_missing', 'شرکت نشست شعبه‌ای ندارد؛ ابتدا شعبه تعریف کنید.');
      }
    }

    if (dto.area_ids && !(await this.repo.areasBelongTo(companyId, dto.area_ids))) {
      throw badRequest('area_not_found', 'یکی از حوزه‌های انتخاب‌شده در این شرکت یافت نشد.');
    }
    return { branchId, jobPositionId };
  }

  private async jobPositionId(companyId: string, code: string): Promise<string> {
    const id = await this.repo.jobPositionId(companyId, code);
    if (!id) {
      throw badRequest('job_position_not_found', `سمت «${code}» برای این شرکت تعریف نشده است.`);
    }
    return id;
  }

  private mapDbError(err: unknown): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'staff_person_id_key') {
      return new ConflictException({
        code: 'duplicate_person',
        message_fa: 'این شخص قبلاً به‌عنوان پرسنل ثبت شده است؛ هر شخص فقط یک ردیف پرسنل دارد.',
      });
    }
    if (pgErr?.code === '23505') {
      return new ConflictException({
        code: 'duplicate_employee_no',
        message_fa: 'شماره پرسنلی (employee_no) برای این شعبه قبلاً ثبت شده است.',
        details: { constraint: pgErr.constraint },
      });
    }
    if (pgErr?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (pgErr?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    return badRequest('staff_save_failed', 'خطای غیرمنتظره در ذخیره پرسنل.');
  }
}
