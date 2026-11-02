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
  CreateAreaDto,
  CreateRouteDto,
  ListAreasQueryDto,
  ListRoutesQueryDto,
  UpdateAreaDto,
  UpdateRouteDto,
} from './structure.dto';
import type { AreaRow, RouteRow, StructureRepository } from './structure.repository';
import { STRUCTURE_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (what: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: `${what} یافت نشد` });

export interface RouteView extends RouteRow {
  customer_ids: string[];
}

@Injectable()
export class StructureService {
  constructor(@Inject(STRUCTURE_REPOSITORY) private readonly repo: StructureRepository) {}

  private assertId(id: string, what: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', `شناسه ${what} ارسال‌شده معتبر نیست.`);
  }

  /** شعبهٔ مالک حوزه: اگر client نفرستد شعبهٔ پیش‌فرض شرکت گرفته می‌شود */
  private async resolveBranch(companyId: string, branchId?: string): Promise<string> {
    if (branchId) {
      if (!(await this.repo.branchExists(companyId, branchId))) {
        throw badRequest('branch_not_found', 'شعبهٔ انتخاب‌شده در این شرکت یافت نشد.');
      }
      return branchId;
    }
    const fallback = await this.repo.defaultBranchId(companyId);
    if (!fallback) {
      throw badRequest('branch_missing', 'شرکت شعبهٔ فعال ندارد؛ ابتدا شعبه تعریف کنید.');
    }
    return fallback;
  }

  private async validateCustomers(companyId: string, customerIds?: string[]): Promise<void> {
    if (!customerIds) return;
    if (!(await this.repo.customersBelongToCompany(companyId, customerIds))) {
      throw badRequest('customer_not_found', 'یکی از مشتریان انتخاب‌شده در این شرکت یافت نشد.');
    }
  }

  // ---------------- حوزه فروش ----------------

  async listAreas(companyId: string, query: ListAreasQueryDto): Promise<Page<AreaRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listAreas(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async getArea(companyId: string, id: string): Promise<AreaRow> {
    this.assertId(id, 'حوزه');
    const row = await this.repo.findArea(companyId, id);
    if (!row) throw notFound('حوزه');
    return row;
  }

  async createArea(companyId: string, dto: CreateAreaDto): Promise<AreaRow> {
    const branchId = await this.resolveBranch(companyId, dto.branch_id);
    if (dto.parent_area_id && !(await this.repo.areaExists(companyId, dto.parent_area_id))) {
      throw badRequest('parent_area_not_found', 'حوزهٔ والد انتخاب‌شده یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insertArea(branchId, dto);
    } catch (err) {
      throw this.mapAreaError(err);
    }
    return this.getArea(companyId, id);
  }

  async updateArea(companyId: string, id: string, dto: UpdateAreaDto): Promise<AreaRow> {
    this.assertId(id, 'حوزه');
    if (dto.parent_area_id && !(await this.repo.areaExists(companyId, dto.parent_area_id))) {
      throw badRequest('parent_area_not_found', 'حوزهٔ والد انتخاب‌شده یافت نشد.');
    }
    if (dto.branch_id && !(await this.repo.branchExists(companyId, dto.branch_id))) {
      throw badRequest('branch_not_found', 'شعبهٔ انتخاب‌شده در این شرکت یافت نشد.');
    }
    try {
      const updated = await this.repo.updateArea(companyId, id, dto);
      if (!updated) throw notFound('حوزه');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapAreaError(err);
    }
    return this.getArea(companyId, id);
  }

  private mapAreaError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_sales_area_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد حوزه در این شعبه قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (e?.code === '23502') {
      return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
    }
    return badRequest('area_save_failed', 'خطای غیرمنتظره در ذخیره حوزه.');
  }

  // ---------------- مسیر فروش ----------------

  async listRoutes(companyId: string, query: ListRoutesQueryDto): Promise<Page<RouteRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listRoutes(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async getRoute(companyId: string, id: string): Promise<RouteView> {
    this.assertId(id, 'مسیر');
    const row = await this.repo.findRoute(companyId, id);
    if (!row) throw notFound('مسیر');
    const customer_ids = await this.repo.findRouteCustomerIds(companyId, id);
    return { ...row, customer_ids };
  }

  async createRoute(companyId: string, dto: CreateRouteDto): Promise<RouteView> {
    if (!(await this.repo.areaExists(companyId, dto.area_id))) {
      throw badRequest('area_not_found', 'حوزهٔ انتخاب‌شده یافت نشد.');
    }
    await this.validateCustomers(companyId, dto.customer_ids);
    let id: string;
    try {
      id = await this.repo.insertRoute(companyId, dto);
    } catch (err) {
      throw this.mapRouteError(err);
    }
    return this.getRoute(companyId, id);
  }

  async updateRoute(companyId: string, id: string, dto: UpdateRouteDto): Promise<RouteView> {
    this.assertId(id, 'مسیر');
    if (dto.area_id && !(await this.repo.areaExists(companyId, dto.area_id))) {
      throw badRequest('area_not_found', 'حوزهٔ انتخاب‌شده یافت نشد.');
    }
    await this.validateCustomers(companyId, dto.customer_ids);
    try {
      const updated = await this.repo.updateRoute(companyId, id, dto);
      if (!updated) throw notFound('مسیر');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapRouteError(err);
    }
    return this.getRoute(companyId, id);
  }

  private mapRouteError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_route_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد مسیر در این حوزه قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (e?.code === '23502') {
      return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
    }
    return badRequest('route_save_failed', 'خطای غیرمنتظره در ذخیره مسیر.');
  }
}
