import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { OnboardingOutcome } from './abuse-control';

interface ProvisionRow extends QueryResultRow {
  company_id: string;
  branch_id: string;
  person_id: string;
  app_user_id: string;
}

/**
 * ریپازیتوریِ استقرار: تابعِ اتمیِ fn_provision_company (مهاجرت 0038) را صدا می‌زند.
 * کلِ ساختِ اجاره (شرکت + شعبه + نقش‌ها + شخص + حسابِ مدیر + انتصابِ نقش) یک
 * عبارتِ SQL است، پس ذاتاً اتمی است (یا همه یا هیچ).
 */
@Injectable()
export class OnboardingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async provisionCompany(p: {
    companyCode: string;
    companyName: string;
    adminUsername: string;
    adminPasswordHash: string;
    adminFirstName: string;
    adminLastName: string;
  }): Promise<ProvisionRow> {
    const { rows } = await this.pool.query<ProvisionRow>(
      `select company_id, branch_id, person_id, app_user_id
         from fn_provision_company($1, $2, $3, $4, $5, $6)`,
      [
        p.companyCode,
        p.companyName,
        p.adminUsername,
        p.adminPasswordHash,
        p.adminFirstName,
        p.adminLastName,
      ],
    );
    return rows[0];
  }

  async companyCodeExists(code: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n from company where code = $1`,
      [code],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  /**
   * ثبتِ یک تلاشِ استقرار در جدولِ ممیزی (مهاجرت 0040) — موفق یا رد‌شده.
   *
   * هیچ رمز یا هشی نوشته نمی‌شود. فراخوان این را best-effort صدا می‌زند:
   * شکستِ ممیزی نباید جلویِ خودِ ثبت‌نام را بگیرد (در لایهٔ سرویس گرفته می‌شود).
   */
  async recordAttempt(a: {
    clientIp?: string | null;
    userAgent?: string | null;
    companyCode?: string | null;
    adminEmail?: string | null;
    outcome: OnboardingOutcome;
    reasonCode?: string | null;
    companyId?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `insert into onboarding_attempt
         (client_ip, user_agent, company_code, admin_email, outcome, reason_code, company_id)
       values ($1::inet, $2, $3, $4, $5, $6, $7::uuid)`,
      [
        a.clientIp ?? null,
        (a.userAgent ?? null)?.slice(0, 400) ?? null,
        (a.companyCode ?? null)?.slice(0, 32) ?? null,
        (a.adminEmail ?? null)?.slice(0, 160) ?? null,
        a.outcome,
        (a.reasonCode ?? null)?.slice(0, 64) ?? null,
        a.companyId ?? null,
      ],
    );
  }

  async usernameExists(username: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n from app_user where lower(username) = lower($1)`,
      [username],
    );
    return (rows[0]?.n ?? 0) > 0;
  }
}
