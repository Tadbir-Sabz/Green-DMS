import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import { ROLES_REPOSITORY } from './tokens';
import type { CreateRoleDto, ListRolesQueryDto, UpdateRoleDto } from './roles.dto';
import type { RoleRow, RolesRepository } from './roles.repository';

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'نقش یافت نشد' });

const conflict = (code: string, message_fa: string): ConflictException =>
  new ConflictException({ code, message_fa });

/**
 * سرویس نقش‌ها — CRUD مسیرهای openapi › /roles با قواعد قرارداد:
 * - هر permission_code باید در جدول permission (seed 0022) باشد وگرنه 400
 * - نقش سیستمی (is_system) کدپذیر نیست و حذف‌نشدنی است
 * - حذف فقط وقتی مجاز است که هیچ کاربری به نقش نسبت نداشته باشد (409 در غیر این صورت)
 */
@Injectable()
export class RolesService {
  constructor(@Inject(ROLES_REPOSITORY) private readonly repo: RolesRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسه ارسال‌شده معتبر نیست.',
      });
    }
  }

  async list(companyId: string, query: ListRolesQueryDto): Promise<Page<RoleRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<RoleRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreateRoleDto): Promise<RoleRow> {
    const permissionCodes = dto.permission_codes ? [...new Set(dto.permission_codes)] : [];
    await this.assertPermissions(permissionCodes);
    try {
      return await this.repo.insert(companyId, {
        code: dto.code,
        name: dto.name,
        permissionCodes,
      });
    } catch (err) {
      throw this.mapDbError(err);
    }
  }

  async update(companyId: string, id: string, dto: UpdateRoleDto): Promise<RoleRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();

    if (before.is_system && dto.code !== undefined && dto.code !== before.code) {
      throw conflict(
        'system_role',
        'کد نقش سیستمی قابل تغییر نیست؛ فقط نام و مجوزهایش قابل ویرایش است.',
      );
    }

    const permissionCodes =
      dto.permission_codes === undefined
        ? undefined
        : [...new Set(dto.permission_codes)];
    if (permissionCodes) await this.assertPermissions(permissionCodes);

    try {
      const row = await this.repo.update(companyId, id, {
        code: dto.code,
        name: dto.name,
        permissionCodes,
      });
      if (!row) throw notFound();
      return row;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapDbError(err);
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    this.assertId(id);
    const role = await this.repo.findById(companyId, id);
    if (!role) throw notFound();
    if (role.is_system) {
      throw conflict('system_role', 'نقش سیستمی حذف نمی‌شود؛ می‌توانید مجوزهایش را ویرایش کنید.');
    }
    const assigned = await this.repo.countAssignedUsers(role.id);
    if (assigned > 0) {
      throw conflict(
        'role_in_use',
        `این نقش به ${assigned} کاربر نسبت داده شده است؛ ابتدا نقش را از کاربران بردارید.`,
      );
    }
    const ok = await this.repo.delete(companyId, id);
    if (!ok) throw notFound();
  }

  private async assertPermissions(codes: string[]): Promise<void> {
    const missing = await this.repo.findMissingPermissionCodes(codes);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'invalid_permission',
        message_fa: 'یک یا چند الگوی مجوز در سیستم تعریف نشده است.',
        details: { missing },
      });
    }
  }

  private mapDbError(err: unknown): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_role_code') {
      return conflict('duplicate_code', 'این کد نقش قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.');
    }
    if (pgErr?.code === '23503') {
      return new BadRequestException({
        code: 'invalid_permission',
        message_fa: 'یکی از الگوهای مجوز معتبر نیست.',
        details: { constraint: pgErr.constraint },
      });
    }
    if (pgErr?.code === '23514') {
      return new BadRequestException({
        code: 'check_violation',
        message_fa: `شرایط نقش معتبر نیست (${pgErr.constraint}).`,
      });
    }
    return new BadRequestException({
      code: 'save_failed',
      message_fa: 'خطای غیرمنتظره در ذخیره نقش.',
      details: { db_code: pgErr?.code },
    });
  }
}
