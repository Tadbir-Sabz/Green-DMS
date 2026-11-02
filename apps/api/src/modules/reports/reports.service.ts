import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { hasAnyPermission } from '../identity-rbac/permissions';
import { REPORTS, REPORT_KEYS, type ReportColumn, type ReportDescriptor } from './report-registry';

/** خروجی اجرای گزارش — مطابق پاسخ GET /reports/{key} در قرارداد */
export interface ReportResult {
  columns: { key: string; title: string }[];
  rows: Record<string, unknown>[];
}

/**
 * سرویس گزارش‌ها (ضمیمه C) — /reports و /reports/{key}.
 * کوئری‌ها روی PG_POOL tenant-aware اجرا می‌شوند (مهاجرت 0021 RLS نشست را می‌بیند)
 * و مجوز هر گزارش پیش از اجرا بررسی می‌شود.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** فهرست گزارش‌هایی که کاربر مجوز دیدنش را دارد */
  descriptors(permissions: readonly string[]): { items: Omit<ReportDescriptor, 'sql' | 'columns'>[] } {
    const items = REPORT_KEYS.map((k) => REPORTS[k])
      .filter((r) => hasAnyPermission(permissions, [r.required_permission]))
      .map(({ key, title, module, required_permission }) => ({
        key,
        title,
        module,
        required_permission,
      }));
    return { items };
  }

  /** اجرای یک گزارش با فیلتر بازه تاریخ؛ ستون‌ها برای رندر/خروجی برگردانده می‌شود */
  async run(
    companyId: string,
    permissions: readonly string[],
    key: string,
    filter: { from?: string; to?: string },
  ): Promise<ReportResult> {
    const report = REPORTS[key];
    if (!report) {
      throw new NotFoundException({ code: 'report_not_found', message_fa: 'گزارش یافت نشد.' });
    }
    if (!hasAnyPermission(permissions, [report.required_permission])) {
      throw new ForbiddenException({
        code: 'forbidden',
        message_fa: 'مجوز مشاهدهٔ این گزارش را ندارید.',
      });
    }
    const { rows } = await this.pool.query<QueryResultRow>(report.sql, [
      companyId,
      filter.from ?? null,
      filter.to ?? null,
    ]);
    return {
      columns: report.columns.map((c: ReportColumn) => ({ key: c.key, title: c.title })),
      rows: rows as Record<string, unknown>[],
    };
  }

  /** CSV از نتیجه گزارش (format=csv) — سرستون فارسی، مقدار از ستون‌های تعریف‌شده */
  toCsv(result: ReportResult): string {
    const esc = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = result.columns.map((c) => esc(c.title)).join(',');
    const body = result.rows
      .map((row) => result.columns.map((c) => esc(row[c.key])).join(','))
      .join('\n');
    // BOM برای نمایش درست فارسی در Excel
    return `\uFEFF${header}\n${body}`;
  }
}
