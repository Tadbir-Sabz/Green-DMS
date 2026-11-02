import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import type {
  CreateJournalDto,
  CreatePeriodDto,
  ListAccountsQueryDto,
  ListJournalsQueryDto,
  ListPeriodsQueryDto,
  TrialBalanceQueryDto,
} from './gl.dto';
import type { FiscalPeriod, GlAccount, JournalEntry, TrialBalanceRow } from './gl.repository';
import type { GlService } from './gl.service';
import { GL_SERVICE } from './tokens';

/**
 * دفتر کل — /gl مطابق openapi.yaml (ماژول ۹، ضمیمه G.۱۵).
 * کدینگ حساب‌ها، دوره‌های مالی، اسناد حسابداری (ثبت سند دستیِ متوازن) و تراز
 * آزمایشی. مجوزها از seed مهاجرت 0022: gl.journal.view/post، gl.period.close،
 * gl.report.view.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('gl')
export class GlController {
  constructor(@Inject(GL_SERVICE) private readonly service: GlService) {}

  // ---------------- Chart of accounts ----------------

  @Get('accounts')
  @RequirePermissions('gl.journal.view')
  accounts(
    @Query() query: ListAccountsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<GlAccount>> {
    return this.service.listAccounts(companyId, query);
  }

  // ---------------- Fiscal periods ----------------

  @Get('periods')
  @RequirePermissions('gl.journal.view')
  periods(
    @Query() query: ListPeriodsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: FiscalPeriod[] }> {
    return this.service.listPeriods(companyId, query);
  }

  @Post('periods')
  @RequirePermissions('gl.period.close')
  createPeriod(
    @Body() dto: CreatePeriodDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<FiscalPeriod> {
    return this.service.createPeriod(companyId, dto);
  }

  @Post('periods/:id/close')
  @HttpCode(200)
  @RequirePermissions('gl.period.close')
  closePeriod(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<FiscalPeriod> {
    return this.service.closePeriod(companyId, id, userId);
  }

  // ---------------- Journal entries ----------------

  @Get('journals')
  @RequirePermissions('gl.journal.view')
  journals(
    @Query() query: ListJournalsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<JournalEntry>> {
    return this.service.listJournals(companyId, query);
  }

  @Get('journals/:id')
  @RequirePermissions('gl.journal.view')
  journal(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<JournalEntry> {
    return this.service.getJournal(companyId, id);
  }

  @Post('journals')
  @RequirePermissions('gl.journal.post')
  createJournal(
    @Body() dto: CreateJournalDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<JournalEntry> {
    return this.service.createJournal(companyId, userId, dto);
  }

  // ---------------- Trial balance ----------------

  @Get('trial-balance')
  @RequirePermissions('gl.report.view')
  trialBalance(
    @Query() query: TrialBalanceQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: TrialBalanceRow[] }> {
    return this.service.trialBalance(companyId, query);
  }
}
