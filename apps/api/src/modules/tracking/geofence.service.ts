import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateGeofenceDto, ListGeofencesQueryDto, UpdateGeofenceDto } from './geofence.dto';
import type { GeofenceRepository, GeofenceRow } from './geofence.repository';
import { GEOFENCE_REPOSITORY } from './tracking.tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

/** GeoJSON Polygon معتبر: دست‌کم یک حلقه، هر حلقه دست‌کم ۴ نقطه، هر نقطه [lng, lat] در بازه */
function validatePolygon(area: { type: string; coordinates: number[][][] }): void {
  if (area.type !== 'Polygon' || !Array.isArray(area.coordinates) || area.coordinates.length === 0) {
    throw badRequest('invalid_geo', 'محدوده باید یک چندضلعی (Polygon) معتبر باشد.');
  }
  for (const ring of area.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw badRequest('invalid_geo', 'هر حلقهٔ محدوده باید دست‌کم ۴ نقطه داشته باشد.');
    }
    for (const point of ring) {
      if (!Array.isArray(point) || point.length !== 2 || point.some((n) => typeof n !== 'number')) {
        throw badRequest('invalid_geo', 'هر نقطه باید [طول، عرض] جغرافیایی باشد.');
      }
      const [lng, lat] = point;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw badRequest('invalid_geo', 'مختصات خارج از بازه مجاز است.');
      }
    }
  }
  const first = area.coordinates[0];
  const a = first[0];
  const b = first[first.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) {
    throw badRequest('invalid_geo', 'حلقهٔ محدوده باید بسته باشد (نقطهٔ اول و آخر یکی).');
  }
}

@Injectable()
export class GeofenceService {
  constructor(@Inject(GEOFENCE_REPOSITORY) private readonly repo: GeofenceRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListGeofencesQueryDto): Promise<Page<GeofenceRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<GeofenceRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'محدوده جغرافیایی یافت نشد' });
    return row;
  }

  async create(companyId: string, dto: CreateGeofenceDto): Promise<GeofenceRow> {
    validatePolygon(dto.area);
    if (dto.kind === 'customer' && !dto.customer_id) {
      throw badRequest('customer_required', 'نوع customer نیازمند customer_id است.');
    }
    if (!(await this.repo.targetsValid(companyId, dto))) {
      throw badRequest('target_not_found', 'مشتری یا انبار ارسال‌شده در این شرکت یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateGeofenceDto): Promise<GeofenceRow> {
    this.assertId(id);
    const current = await this.get(companyId, id);
    if (dto.area !== undefined) validatePolygon(dto.area);
    const kind = dto.kind ?? current.kind;
    const customerId = dto.customer_id !== undefined ? dto.customer_id : current.customer_id;
    if (kind === 'customer' && !customerId) {
      throw badRequest('customer_required', 'نوع customer نیازمند customer_id است.');
    }
    if (!(await this.repo.targetsValid(companyId, dto))) {
      throw badRequest('target_not_found', 'مشتری یا انبار ارسال‌شده در این شرکت یافت نشد.');
    }
    try {
      await this.repo.update(companyId, id, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    this.assertId(id);
    const ok = await this.repo.remove(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'محدوده جغرافیایی یافت نشد' });
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e?.message === 'branch not found') {
      return badRequest('branch_not_found', 'شعبه فعالی برای این شرکت یافت نشد.');
    }
    if (e?.code === '23514' && e.constraint === 'ck_geofence_target') {
      return badRequest('customer_required', 'نوع customer نیازمند customer_id است.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    return badRequest('geofence_save_failed', 'خطای غیرمنتظره در ثبت محدوده.');
  }
}
