import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { AuthRepository } from './auth.repository';
import { hashPassword } from './password';
import { AUTH_REPOSITORY, USERS_REPOSITORY } from './tokens';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto';
import type { UserRow, UsersRepository } from './users.repository';

/** پیام‌های قرارداد Error برای خطاهای دامنه کاربران */
const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'کاربر یافت نشد' });

const usernameTaken = (): ConflictException =>
  new ConflictException({
    code: 'username_taken',
    message_fa: 'این نام کاربری قبلاً ثبت شده است؛ نام دیگری انتخاب کنید.',
  });

/**
 * سرویس کاربران — CRUD مسیرهای openapi › /users با قواعد:
 * - حذف فیزیکی ممنوع (ممیزی): DELETE صرفاً غیرفعال می‌کند و نشست‌های باز را می‌بندد
 * - نقش‌ها باید متعلق به شرکتِ نشست باشند (درز چندشرکتی ندارد)
 * - شخصِ کاربر یا از پرسنل موجود (staff_id) می‌آید یا ساخته می‌شود
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly repo: UsersRepository,
    @Inject(AUTH_REPOSITORY) private readonly authRepo: AuthRepository,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسه ارسال‌شده معتبر نیست.',
      });
    }
  }

  async list(companyId: string, query: ListUsersQueryDto): Promise<Page<UserRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<UserRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreateUserDto): Promise<UserRow> {
    // بررسی پیش از ساخت شخص: کد شخص از نام کاربری می‌آید وگرنه قیدِ شخص زودتر
    // می‌شکست و پاسخ به‌جای username_taken، person_code_exists می‌شد
    if (await this.repo.usernameExists(dto.username)) throw usernameTaken();

    const roleIds = await this.assertRoles(companyId, dto.role_ids);

    let personId: string | null = null;
    if (dto.staff_id) {
      personId = await this.repo.findStaffPersonId(companyId, dto.staff_id);
      if (!personId) {
        throw new BadRequestException({
          code: 'invalid_staff',
          message_fa: 'پرسنل انتخاب‌شده برای این شرکت تعریف نشده است.',
        });
      }
    }

    try {
      return await this.repo.insert(companyId, {
        username: dto.username,
        passwordHash: dto.password ? await hashPassword(dto.password) : null,
        accessLevel: dto.access_level ?? 'web',
        isActive: dto.is_active ?? true,
        personId,
        personCode: dto.person_code ?? `USR-${dto.username}`,
        firstName: dto.first_name,
        lastName: dto.last_name ?? null,
        roleIds,
      });
    } catch (err) {
      throw this.mapDbError(err, 'ساخت کاربر');
    }
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateUserDto,
    currentUserId: string,
  ): Promise<UserRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();

    const roleIds =
      dto.role_ids === undefined ? undefined : await this.assertRoles(companyId, dto.role_ids);

    let row: UserRow | null;
    try {
      row = await this.repo.update(companyId, id, {
        username: dto.username,
        passwordHash: dto.password !== undefined ? await hashPassword(dto.password) : undefined,
        accessLevel: dto.access_level,
        isActive: dto.is_active,
        isLocked: dto.is_locked,
        roleIds,
      });
    } catch (err) {
      throw this.mapDbError(err, 'بروزرسانی کاربر');
    }
    if (!row) throw notFound();

    // غیرفعال‌سازی از هر مسیری باید نشست‌های باز را هم فوراً ببندد
    if (dto.is_active === false && id !== currentUserId) {
      await this.authRepo.revokeAllForUser(id, 'admin');
    }
    return row;
  }

  /**
   * غیرفعال‌سازی (نه حذف): ردیف برای ممیزی می‌ماند، ورود و هر درخواست
   * مجوزدارِ نشستِ موجود با 401 رد می‌شود و نشست‌ها باطل می‌شوند.
   * غیرفعال‌سازی خودِ احرازکننده ممنوع است تا مدیر خودش را قفل نکند.
   */
  async remove(companyId: string, id: string, currentUserId: string): Promise<void> {
    this.assertId(id);
    if (id === currentUserId) {
      throw new ConflictException({
        code: 'self_deactivate',
        message_fa: 'نمی‌توانید حساب کاربری خودتان را غیرفعال کنید؛ از مدیر دیگری بخواهید.',
      });
    }
    const ok = await this.repo.deactivate(companyId, id);
    if (!ok) throw notFound();
    await this.authRepo.revokeAllForUser(id, 'admin');
  }

  /** نقش‌های خواسته‌شده باید همه برای همین شرکت باشند؛ لیست بدون تکرار برمی‌گردد */
  private async assertRoles(companyId: string, roleIds?: string[]): Promise<string[]> {
    if (!roleIds) return [];
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return [];
    const existing = new Set(await this.repo.findExistingRoleIds(companyId, unique));
    const missing = unique.filter((r) => !existing.has(r));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'invalid_role',
        message_fa: 'یک یا چند نقش انتخاب‌شده برای این شرکت تعریف نشده است.',
        details: { missing },
      });
    }
    return unique;
  }

  private mapDbError(err: unknown, action: string): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_app_user_username') {
      return usernameTaken();
    }
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_person_code') {
      return new ConflictException({
        code: 'person_code_exists',
        message_fa: 'کد شخص برای این شرکت قبلاً ثبت شده است؛ person_code دیگری بدهید.',
      });
    }
    if (pgErr?.code === '23503') {
      return new BadRequestException({
        code: 'invalid_reference',
        message_fa: 'یکی از مراجع (پرسنل/نقش) معتبر نیست.',
      });
    }
    if (pgErr?.code === '23514') {
      return new BadRequestException({
        code: 'check_violation',
        message_fa: `شرایط کاربر معتبر نیست (${pgErr.constraint}).`,
      });
    }
    return new BadRequestException({
      code: `${action}_failed`,
      message_fa: 'خطای غیرمنتظره در ذخیره کاربر.',
      details: { db_code: pgErr?.code },
    });
  }
}
