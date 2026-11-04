import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

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

  async usernameExists(username: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n from app_user where lower(username) = lower($1)`,
      [username],
    );
    return (rows[0]?.n ?? 0) > 0;
  }
}
