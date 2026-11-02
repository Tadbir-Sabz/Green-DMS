import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { SettingEntryDto } from './settings.dto';

/** یک تنظیم — شکل schemas.SettingEntry */
export interface SettingRow extends QueryResultRow {
  key: string;
  value: string;
  scope_type: string;
  scope_id: string | null;
}

/**
 * دسترسی دادهٔ تنظیمات (ماژول ۱۱) روی جدول setting (مهاجرت 0002 + 0031).
 * همه کوئری‌ها با company_id نشست محدود می‌شوند: تنظیم company/branch/area از
 * دامنهٔ همان شرکت و global یا company_id=null (پیش‌فرض سراسری) یا company_id شرکت.
 */
@Injectable()
export class SettingsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    companyId: string,
    filter: { scope_type?: string; scope_id?: string },
  ): Promise<SettingRow[]> {
    const params: unknown[] = [companyId];
    const where: string[] = ['(s.company_id = $1 or (s.scope_type = \'global\' and s.company_id is null))'];
    if (filter.scope_type) {
      params.push(filter.scope_type);
      where.push(`s.scope_type = $${params.length}`);
    }
    if (filter.scope_id) {
      params.push(filter.scope_id);
      where.push(`s.scope_id = $${params.length}`);
    }
    const { rows } = await this.pool.query<{
      key: string;
      value: unknown;
      scope_type: string;
      scope_id: string | null;
    }>(
      `select s.key, s.value, s.scope_type, s.scope_id
         from setting s
        where ${where.join(' and ')}
        order by s.scope_type, s.key`,
      params,
    );
    // value در DB jsonb است؛ برای قرارداد به رشته ساده تبدیل می‌شود
    return rows.map((r) => ({
      key: r.key,
      value: jsonValueToString(r.value),
      scope_type: r.scope_type,
      scope_id: r.scope_id,
    }));
  }

  /**
   * upsert یک تنظیم. برای global بدون scope_id، company_id نشست ذخیره می‌شود تا
   * تنظیم سراسریِ هر شرکت (tenant) جدا بماند.
   */
  async upsert(
    companyId: string,
    actorUserId: string | null,
    entry: SettingEntryDto,
  ): Promise<void> {
    const scopeType = entry.scope_type ?? 'company';
    // scope_id: برای company پیش‌فرض خودِ شرکت است؛ برای global تهی
    let scopeId = entry.scope_id ?? null;
    if (scopeType === 'company' && !scopeId) scopeId = companyId;

    await this.pool.query(
      `insert into setting (key, scope_type, scope_id, value, value_type, company_id, updated_by, updated_at)
       values ($1, $2, $3, $4::jsonb, 'text', $5, $6, now())
       on conflict (key, scope_type, coalesce(scope_id, company_id))
       do update set value = excluded.value,
                     company_id = excluded.company_id,
                     updated_by = excluded.updated_by,
                     updated_at = now()`,
      [entry.key, scopeType, scopeId, JSON.stringify(entry.value), companyId, actorUserId],
    );
  }

  /** مقدار مؤثر یک کلید با سلسله‌مراتب override (fn_setting مهاجرت 0031) */
  async effective(
    companyId: string,
    key: string,
    scope: { branchId?: string | null; areaId?: string | null; userId?: string | null },
  ): Promise<string | null> {
    const { rows } = await this.pool.query<{ value: unknown }>(
      `select fn_setting($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid) as value`,
      [key, companyId, scope.branchId ?? null, scope.areaId ?? null, scope.userId ?? null],
    );
    const v = rows[0]?.value;
    return v == null ? null : jsonValueToString(v);
  }
}

/** jsonb ذخیره‌شده (که همیشه به‌صورت رشتهٔ JSON درآمده) به مقدار متنی قرارداد */
const jsonValueToString = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
};
