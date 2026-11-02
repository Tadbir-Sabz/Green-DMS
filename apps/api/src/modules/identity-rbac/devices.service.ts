import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { AuthRepository } from './auth.repository';
import type { CreateDeviceDto, ListDevicesQueryDto } from './devices.dto';
import type { DeviceRow, DevicesRepository, InsertDeviceInput } from './devices.repository';
import { AUTH_REPOSITORY, DEVICES_REPOSITORY } from './tokens';

/** پیام‌های قرارداد Error برای خطاهای دامنه دستگاه‌های مجاز */
const invalidId = (): BadRequestException =>
  new BadRequestException({ code: 'invalid_id', message_fa: 'شناسه دستگاه معتبر نیست.' });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'device_not_found', message_fa: 'دستگاه یافت نشد.' });

const deviceExists = (): ConflictException =>
  new ConflictException({
    code: 'device_exists',
    message_fa: 'این دستگاه قبلاً ثبت شده است؛ برای ابطال از فهرست دستگاه‌ها اقدام کنید.',
  });

const deviceTaken = (): ConflictException =>
  new ConflictException({
    code: 'device_taken',
    message_fa: 'این شناسه دستگاه به کاربر دیگری ثبت شده است؛ از دستگاه خودتان استفاده کنید.',
  });

const notRegistered = (): BadRequestException =>
  new BadRequestException({
    code: 'device_not_registered',
    message_fa: 'این دستگاه هنوز ثبت نشده است؛ پیش از ورود، دستگاه را ثبت کنید.',
  });

const deviceRevoked = (): ForbiddenException =>
  new ForbiddenException({
    code: 'device_revoked',
    message_fa: 'این دستگاه باطل شده است؛ برای فعال‌سازی مجدد با مدیر سیستم تماس بگیرید.',
  });

const notOwned = (): ForbiddenException =>
  new ForbiddenException({
    code: 'device_not_owned',
    message_fa: 'این دستگاه به کاربر دیگری تعلق دارد.',
  });

const toInput = (dto: CreateDeviceDto): InsertDeviceInput => ({
  deviceUuid: dto.device_uuid,
  platform: dto.platform,
  appKind: dto.app_kind,
  appVersion: dto.app_version ?? null,
  osVersion: dto.os_version ?? null,
  pushToken: dto.push_token ?? null,
});

/**
 * سرویس دستگاه‌های مجاز — openapi › /devices و منطق device_bind در /auth/otp/verify.
 * قواعد:
 * - هر دستگاه فقط برای کاربرِ نشست قابل دیدن/ابطال است (درز بین کاربران ندارد)
 * - ثبت، دستگاه را is_trusted=false می‌سازد؛ تأیید با کد پیامکی آن را مجاز می‌کند
 * - ابطال، نشست‌های فعال همان دستگاه را هم با revoked_reason=device_revoked می‌بندد
 *   (مهاجرت 0025) تا گوشی سرقتی بلافاصله از سیستم بیرون برود
 */
@Injectable()
export class DevicesService {
  constructor(
    @Inject(DEVICES_REPOSITORY) private readonly repo: DevicesRepository,
    @Inject(AUTH_REPOSITORY) private readonly authRepo: AuthRepository,
  ) {}

  async list(userId: string, query: ListDevicesQueryDto): Promise<Page<DeviceRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listByUser(
      userId,
      query.cursor,
      query.limit,
    );
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async create(userId: string, dto: CreateDeviceDto): Promise<DeviceRow> {
    const mine = await this.repo.findByUserAndUuid(userId, dto.device_uuid);
    if (mine) {
      // دستگاه باطل‌شدهٔ خودِ کاربر دوباره فعال می‌شود (نسخه تازه اپ/نصح مجدد)
      if (mine.revoked_at) {
        const revived = await this.repo.reactivate(mine.id, userId, toInput(dto));
        if (revived) return revived;
        // همزمانی: ردیف هم‌زمان توسط درخواست دیگری فعال شد؛ همان را برمی‌گردانیم
        const current = await this.repo.findById(mine.id);
        if (current) return current;
      }
      throw deviceExists();
    }

    const taken = await this.repo.findByUuid(dto.device_uuid);
    if (taken) throw deviceTaken();

    try {
      return await this.repo.insert(userId, toInput(dto));
    } catch (err) {
      // uq_device: ثبت هم‌زمان دو درخواست — برنده ردیف را می‌خواند و بازنده 409 می‌گیرد
      if ((err as { code?: string }).code === '23505') {
        const again = await this.repo.findByUserAndUuid(userId, dto.device_uuid);
        if (again) throw deviceExists();
        throw deviceTaken();
      }
      throw err;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!isUUID(id, '4')) throw invalidId();
    const device = await this.repo.findById(id);
    // 404 برای دستگاهِ دیگری هم همان است تا وجود دستگاه‌های بقیه لو نرود
    if (!device || device.app_user_id !== userId) throw notFound();

    await this.repo.revoke(id, userId);
    // ابطال از راه دور: نشست‌های باز روی همین دستگاه هم بسته می‌شوند (0025)
    await this.authRepo.revokeSessionsForDevice(id);
  }

  // ---------------- اتصال دستگاه در /auth/otp/verify (device_bind) ----------------

  /**
   * اعتبارسنجی دستگاهِ ارسال‌شده در verify، پیش از مصرف کد:
   * کدِ درست با دستگاهِ نامعتبر نمی‌سوزد و کاربر می‌تواند همان کد را دوباره بفرستد.
   */
  async assertBindable(userId: string, deviceId: string): Promise<void> {
    if (!isUUID(deviceId, '4')) throw notRegistered();
    const device = await this.repo.findById(deviceId);
    if (!device) throw notRegistered();
    if (device.app_user_id !== userId) throw notOwned();
    if (device.revoked_at) throw deviceRevoked();
  }

  /** پس از مصرف موفق کد: دستگاه مجاز و حاضر ثبت می‌شود */
  async markBound(deviceId: string): Promise<void> {
    await this.repo.markTrusted(deviceId);
  }
}
