import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsOptional, IsDateString } from 'class-validator';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import type { ReportsService } from './reports.service';
import { REPORTS_SERVICE } from './tokens';

/** GET /reports/{key} — فیلتر بازه + قالب خروجی */
export class RunReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['json', 'csv', 'xlsx'])
  format?: 'json' | 'csv' | 'xlsx' = 'json';
}

/**
 * گزارش‌ها — /reports (فهرست مجاز) و /reports/{key} (اجرا) مطابق openapi.yaml.
 * مجوز هر گزارش درون سرویس با permission کاربر سنجیده می‌شود (نه یک مجوز ثابت)،
 * چون فهرست گزارش‌ها باید فقط گزارش‌های مجازِ همان کاربر را نشان دهد.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(@Inject(REPORTS_SERVICE) private readonly service: ReportsService) {}

  @Get()
  list(@CurrentUser() auth: AuthContext): {
    items: { key: string; title: string; module: string; required_permission: string }[];
  } {
    return this.service.descriptors(auth.permissions);
  }

  @Get(':key')
  async run(
    @Param('key') key: string,
    @Query() query: RunReportQueryDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const result = await this.service.run(companyId, auth.permissions, key, query);
    const format = query.format ?? 'json';
    if (format === 'json') return result;

    if (format === 'csv') {
      const csv = this.service.toCsv(result);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${key}.csv"`);
      return new StreamableFile(Buffer.from(csv, 'utf8'));
    }

    // xlsx — برگهٔ حداقلی SpreadsheetML (بدون وابستگی سنگین) که Excel می‌خواند
    const xlsx = buildSpreadsheetXml(result.columns, result.rows);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${key}.xls"`);
    return new StreamableFile(Buffer.from(xlsx, 'utf8'));
  }
}

/**
 * ساخت SpreadsheetML 2003 (XML) — قالبی که Excel/LibreOffice بی‌وابستگی باز
 * می‌کنند. برای xlsx واقعی (zip) کلاینت وب از کتابخانه xlsx استفاده می‌کند؛
 * اینجا خروجی سمت سرور سبک و قابل‌اتکا نگه داشته می‌شود.
 */
function buildSpreadsheetXml(
  columns: { key: string; title: string }[],
  rows: Record<string, unknown>[],
): string {
  const esc = (v: unknown): string =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const headerCells = columns.map((c) => `<Cell><Data ss:Type="String">${esc(c.title)}</Data></Cell>`).join('');
  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${columns
          .map((c) => {
            const v = row[c.key];
            const isNum = typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)));
            return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
          })
          .join('')}</Row>`,
    )
    .join('');
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="Report"><Table>` +
    `<Row>${headerCells}</Row>${bodyRows}` +
    `</Table></Worksheet></Workbook>`;
}
