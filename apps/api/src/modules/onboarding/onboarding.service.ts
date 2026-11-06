import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { hashPassword } from '../identity-rbac/password';
import { ONBOARDING_REPOSITORY } from './tokens';
import type { OnboardingRepository } from './onboarding.repository';
import type { RegisterTenantDto, RegisterTenantResult } from './onboarding.dto';
import {
  getOnboardingGuard,
  isValidInviteCode,
  normalizeIpForDb,
  passwordIssues,
  type OnboardingOutcome,
  type RegisterMeta,
} from './abuse-control';

/**
 * سرویسِ خودخدمت‌دهیِ استقرار. رمزِ مدیر را با scrypt (بازاستفاده از password.ts
 * کارکنان) هش می‌کند و ساختِ اتمیِ اجاره را به fn_provision_company می‌سپارد.
 * بررسیِ یکتایی پیش از درج برای پیامِ خطایِ دوستانه است؛ در صورتِ شرطِ رقابت،
 * نقضِ یکتاییِ خودِ دیتابیس (23505) گرفته و به 409 نگاشت می‌شود.
 *
 * محافظت در برابرِ سوءاستفاده (P0): این endpoint عمومی است، پس
 *   - اعتبارسنجیِ مقاومِ رمز «پیش از» هر کارِ پرهزینه انجام می‌شود (هشِ scrypt
 *     عمدداً گران است؛ اگر ورودی ضعیف باشد نباید CPU سوزانده شود)،
 *   - حالتِ «کدِ دعوت» با env قابلِ فعال‌سازی است (ONBOARDING_MODE=invite)،
 *   - «هر» تلاش (موفق و رد‌شده) در onboarding_attempt ممیزی می‌شود.
 * نرخ‌گذاری در کنترلر اعمال می‌شود چون به زمینهٔ درخواست (IP) نیاز دارد.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(@Inject(ONBOARDING_REPOSITORY) private readonly repo: OnboardingRepository) {}

  async register(
    dto: RegisterTenantDto,
    meta: RegisterMeta = {},
  ): Promise<RegisterTenantResult> {
    const { policy } = getOnboardingGuard();

    // ۱) سیاستِ رمز — ارزان‌ترین بررسی، پس اول
    const issues = passwordIssues(dto.admin_password ?? '', policy);
    if (issues.length > 0) {
      await this.recordRejection('rejected_policy', issues[0], dto, meta);
      throw new BadRequestException({
        code: 'weak_password',
        issues,
        message_fa:
          'رمزِ عبور به اندازهٔ کافی قوی نیست؛ دستِ‌کم ۸ نویسه و ترکیبی از حروفِ کوچک، حروفِ بزرگ، رقم و نماد لازم است.',
      });
    }

    // ۲) کدِ دعوت (فقط در حالتِ invite)
    if (!isValidInviteCode(dto.invite_code, policy)) {
      await this.recordRejection('rejected_policy', 'invite_code_invalid', dto, meta);
      throw new ForbiddenException({
        code: dto.invite_code ? 'invite_code_invalid' : 'invite_code_required',
        message_fa: 'برایِ ثبتِ شرکت به کدِ دعوتِ معتبر نیاز است.',
      });
    }

    if (await this.repo.companyCodeExists(dto.company_code)) {
      await this.recordRejection('rejected_conflict', 'company_code_taken', dto, meta);
      throw new ConflictException({
        code: 'company_code_taken',
        message_fa: 'این کدِ شرکت پیش‌تر ثبت شده است.',
      });
    }
    if (await this.repo.usernameExists(dto.admin_email)) {
      await this.recordRejection('rejected_conflict', 'email_taken', dto, meta);
      throw new ConflictException({
        code: 'email_taken',
        message_fa: 'این ایمیل پیش‌تر به‌عنوان نامِ کاربری ثبت شده است.',
      });
    }

    const passwordHash = await hashPassword(dto.admin_password);
    try {
      const row = await this.repo.provisionCompany({
        companyCode: dto.company_code,
        companyName: dto.company_name,
        adminUsername: dto.admin_email,
        adminPasswordHash: passwordHash,
        adminFirstName: dto.admin_first_name ?? 'مدیر',
        adminLastName: dto.admin_last_name ?? dto.company_name,
      });
      await this.audit('created', null, dto, meta, row.company_id);
      return {
        company_id: row.company_id,
        branch_id: row.branch_id,
        app_user_id: row.app_user_id,
        admin_username: dto.admin_email,
      };
    } catch (e) {
      // 23505 = نقضِ یکتایی (رقابتِ هم‌زمان روی کدِ شرکت یا نامِ کاربری)
      if ((e as { code?: string })?.code === '23505') {
        await this.recordRejection('rejected_conflict', 'already_exists', dto, meta);
        throw new ConflictException({
          code: 'already_exists',
          message_fa: 'شرکت یا ایمیل هم‌اکنون ثبت شده است.',
        });
      }
      await this.recordRejection('failed', 'provision_error', dto, meta);
      throw e;
    }
  }

  /**
   * ثبتِ تلاشِ «رد‌شده» از سویِ لایهٔ بیرونی (مثلاً محافظِ نرخ در کنترلر).
   * عمومی است چون نرخ‌گذاری به زمینهٔ HTTP نیاز دارد و در کنترلر انجام می‌شود.
   */
  async recordRejection(
    outcome: OnboardingOutcome,
    reasonCode: string,
    dto?: Partial<RegisterTenantDto> | null,
    meta: RegisterMeta = {},
  ): Promise<void> {
    await this.audit(outcome, reasonCode, dto ?? {}, meta, null);
  }

  /**
   * نوشتنِ ممیزی به‌صورتِ best-effort: شکستِ آن (مثلاً نبودِ جدول در یک پایگاهِ
   * قدیمی، یا IP غیرقابلِ درج) هرگز نباید جلویِ جریانِ اصلیِ ثبت را بگیرد.
   * خطا فقط گزارش می‌شود تا فقدانِ ممیزی «بی‌صدا» نماند.
   */
  private async audit(
    outcome: OnboardingOutcome,
    reasonCode: string | null,
    dto: Partial<RegisterTenantDto>,
    meta: RegisterMeta,
    companyId: string | null,
  ): Promise<void> {
    try {
      await this.repo.recordAttempt({
        clientIp: normalizeIpForDb(meta.clientIp),
        userAgent: meta.userAgent ?? null,
        companyCode: dto.company_code ?? null,
        adminEmail: dto.admin_email ?? null,
        outcome,
        reasonCode,
        companyId,
      });
    } catch (err) {
      this.logger.warn(
        `onboarding audit write failed (outcome=${outcome}, reason=${reasonCode}): ${(err as Error)?.message}`,
      );
    }
  }
}
