import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { hashPassword } from '../identity-rbac/password';
import { ONBOARDING_REPOSITORY } from './tokens';
import type { OnboardingRepository } from './onboarding.repository';
import type { RegisterTenantDto, RegisterTenantResult } from './onboarding.dto';

/**
 * سرویسِ خودخدمت‌دهیِ استقرار. رمزِ مدیر را با scrypt (بازاستفاده از password.ts
 * کارکنان) هش می‌کند و ساختِ اتمیِ اجاره را به fn_provision_company می‌سپارد.
 * بررسیِ یکتایی پیش از درج برای پیامِ خطایِ دوستانه است؛ در صورتِ شرطِ رقابت،
 * نقضِ یکتاییِ خودِ دیتابیس (23505) گرفته و به 409 نگاشت می‌شود.
 */
@Injectable()
export class OnboardingService {
  constructor(@Inject(ONBOARDING_REPOSITORY) private readonly repo: OnboardingRepository) {}

  async register(dto: RegisterTenantDto): Promise<RegisterTenantResult> {
    if (await this.repo.companyCodeExists(dto.company_code)) {
      throw new ConflictException({
        code: 'company_code_taken',
        message_fa: 'این کدِ شرکت پیش‌تر ثبت شده است.',
      });
    }
    if (await this.repo.usernameExists(dto.admin_email)) {
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
      return {
        company_id: row.company_id,
        branch_id: row.branch_id,
        app_user_id: row.app_user_id,
        admin_username: dto.admin_email,
      };
    } catch (e) {
      // 23505 = نقضِ یکتایی (رقابتِ هم‌زمان روی کدِ شرکت یا نامِ کاربری)
      if ((e as { code?: string })?.code === '23505') {
        throw new ConflictException({
          code: 'already_exists',
          message_fa: 'شرکت یا ایمیل هم‌اکنون ثبت شده است.',
        });
      }
      throw e;
    }
  }
}
