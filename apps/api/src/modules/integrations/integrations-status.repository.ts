import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/** کلیدهای یکپارچه‌سازی قرارداد (IntegrationStatus.key) */
export const INTEGRATION_KEYS = ['moadian', 'pos', 'sms', 'gateway'] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

/** نگاشت کلید قرارداد → provider در integration_credential */
const KEY_TO_PROVIDER: Record<IntegrationKey, string> = {
  moadian: 'moadian',
  pos: 'psp',
  sms: 'sms',
  gateway: 'bank',
};

export interface IntegrationStatusRow extends QueryResultRow {
  key: IntegrationKey;
  title: string;
  healthy: boolean;
  last_success_at: string | null;
  last_error: string | null;
}

interface CredentialRow extends QueryResultRow {
  provider: string;
  is_active: boolean;
  valid_until: string | null;
  has_secret: boolean;
}

const TITLES: Record<IntegrationKey, string> = {
  moadian: 'سامانه مؤدیان (مالیات)',
  pos: 'پایانه فروش (POS)',
  sms: 'پیامک',
  gateway: 'درگاه پرداخت',
};

/**
 * دسترسی دادهٔ وضعیت یکپارچه‌سازی‌ها (ضمیمه D). سلامت هر سرویس از روی
 * اعتبارنامهٔ پیکربندی‌شده (integration_credential) و آخرین فعالیت در صف‌های
 * مؤدیان/پرداخت تعیین می‌شود. همه کوئری‌ها به شرکتِ نشست قفل‌اند.
 */
@Injectable()
export class IntegrationsStatusRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  static providerForKey(key: IntegrationKey): string {
    return KEY_TO_PROVIDER[key];
  }
  static titleForKey(key: IntegrationKey): string {
    return TITLES[key];
  }

  /** اعتبارنامه‌های فعال شرکت — یک ردیف به‌ازای هر provider */
  async credentials(companyId: string): Promise<Map<string, CredentialRow>> {
    const { rows } = await this.pool.query<CredentialRow>(
      `select provider, is_active, valid_until,
              (secret_enc is not null and octet_length(secret_enc) > 0) as has_secret
         from integration_credential
        where company_id = $1
        order by provider`,
      [companyId],
    );
    const byProvider = new Map<string, CredentialRow>();
    for (const r of rows) {
      // اگر چند اعتبارنامه برای یک provider است، فعالِ منقضی‌نشده اولویت دارد
      const prev = byProvider.get(r.provider);
      if (!prev || (r.is_active && !prev.is_active)) byProvider.set(r.provider, r);
    }
    return byProvider;
  }

  /** آخرین موفقیت/خطای مؤدیان از صف moadian_submission (دامنهٔ شرکت از invoice→branch) */
  async moadianActivity(companyId: string): Promise<{ last_success_at: string | null; last_error: string | null }> {
    const { rows } = await this.pool.query<{ last_success_at: string | null; last_error: string | null }>(
      `select
         (select max(m.sent_at) from moadian_submission m
            join invoice i on i.id = m.invoice_id
            join branch b on b.id = i.branch_id
           where b.company_id = $1 and m.status in ('sent','accepted')) as last_success_at,
         (select m.last_error from moadian_submission m
            join invoice i on i.id = m.invoice_id
            join branch b on b.id = i.branch_id
           where b.company_id = $1 and m.status in ('rejected','dead') and m.last_error is not null
           order by m.created_at desc limit 1) as last_error`,
      [companyId],
    );
    return rows[0] ?? { last_success_at: null, last_error: null };
  }

  /** آخرین موفقیت/خطای پرداخت (POS/درگاه) از psp_transaction */
  async pspActivity(companyId: string): Promise<{ last_success_at: string | null; last_error: string | null }> {
    const { rows } = await this.pool.query<{ last_success_at: string | null; last_error: string | null }>(
      `select
         (select max(p.txn_at) from psp_transaction p
            join branch b on b.id = p.branch_id
           where b.company_id = $1 and p.status = 'success') as last_success_at,
         (select case when p.status = 'failed' then 'تراکنش ناموفق'
                      when p.status = 'reversed' then 'تراکنش برگشت خورد' end
            from psp_transaction p
            join branch b on b.id = p.branch_id
           where b.company_id = $1 and p.status in ('failed','reversed')
           order by p.txn_at desc limit 1) as last_error`,
      [companyId],
    );
    return rows[0] ?? { last_success_at: null, last_error: null };
  }
}
