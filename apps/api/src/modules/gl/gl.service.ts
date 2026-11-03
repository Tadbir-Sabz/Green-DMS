import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type {
  FiscalPeriod,
  GlAccount,
  GlRepository,
  JournalEntry,
  TrialBalanceRow,
} from './gl.repository';
import { GL_REPOSITORY } from './tokens';
import type {
  CreateJournalDto,
  CreatePeriodDto,
  ListAccountsQueryDto,
  ListJournalsQueryDto,
  ListPeriodsQueryDto,
  TrialBalanceQueryDto,
} from './gl.dto';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });
const conflict = (code: string, message_fa: string): ConflictException =>
  new ConflictException({ code, message_fa });
/** 422 RuleRejected قرارداد — برای سند نابalance یا دورهٔ بسته */
const unprocessable = (code: string, message_fa: string): UnprocessableEntityException =>
  new UnprocessableEntityException({ code, message_fa });
const notFound = (message_fa: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa });

/** جمع اعشاری دقیق رشته‌ها (بدون از دست دادن دقت با Number روی مقادیر بزرگ) */
function sumDecimal(values: (string | undefined)[]): number {
  return values.reduce((acc, v) => {
    const n = v == null || v === '' ? 0 : Number(v);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/**
 * دفتر کل (ماژول ۹) — خواندن کدینگ/اسناد/تراز و ثبت سند دستیِ متوازن.
 *
 * اعتبارسنجی‌های پیش از نوشتن تا پیام فارسی قرارداد برگردد (نه خطای خام DB)؛
 * تریگرهای پایگاه‌داده (fn_journal_balanced، fn_check_journal_period،
 * ck_journal_line_one_side) لایهٔ دوم حفاظت هستند.
 */
@Injectable()
export class GlService {
  constructor(@Inject(GL_REPOSITORY) private readonly repo: GlRepository) {}

  private assertId(id: string, label: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', `${label} معتبر نیست.`);
  }

  // ---------------- Chart of accounts ----------------

  async listAccounts(
    companyId: string,
    query: ListAccountsQueryDto,
  ): Promise<Page<GlAccount>> {
    const { items, nextCursor, hasMore } = await this.repo.listAccounts(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  // ---------------- Fiscal periods ----------------

  async listPeriods(
    companyId: string,
    query: ListPeriodsQueryDto,
  ): Promise<{ items: FiscalPeriod[] }> {
    const items = await this.repo.listPeriods(companyId, query);
    return { items };
  }

  async createPeriod(companyId: string, dto: CreatePeriodDto): Promise<FiscalPeriod> {
    if (dto.end_date < dto.start_date) {
      throw badRequest('invalid_range', 'پایان دوره نمی‌تواند پیش از شروع آن باشد.');
    }
    let id: string;
    try {
      id = await this.repo.insertPeriod(companyId, dto);
    } catch (err) {
      throw this.mapPeriodError(err);
    }
    const period = await this.repo.findPeriod(companyId, id);
    if (!period) throw notFound('دورهٔ مالی یافت نشد');
    return period;
  }

  async closePeriod(companyId: string, id: string, userId: string): Promise<FiscalPeriod> {
    this.assertId(id, 'شناسهٔ دوره');
    const closed = await this.repo.closePeriod(companyId, id, userId);
    if (closed) return closed;
    const existing = await this.repo.findPeriod(companyId, id);
    if (!existing) throw notFound('دورهٔ مالی یافت نشد');
    throw conflict('period_not_open', 'دوره از قبل بسته یا قفل شده است.');
  }

  // ---------------- Journal entries ----------------

  async listJournals(
    companyId: string,
    query: ListJournalsQueryDto,
  ): Promise<Page<JournalEntry>> {
    const { items, nextCursor, hasMore } = await this.repo.listJournals(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async getJournal(companyId: string, id: string): Promise<JournalEntry> {
    this.assertId(id, 'شناسهٔ سند');
    const entry = await this.repo.findJournal(companyId, id);
    if (!entry) throw notFound('سند حسابداری یافت نشد');
    return entry;
  }

  async createJournal(
    companyId: string,
    userId: string,
    dto: CreateJournalDto,
  ): Promise<JournalEntry> {
    // ۱) شعبه باید به این شرکت تعلق داشته باشد (مبنای series شمارهٔ سند)
    const branchOk = await this.repo.branchBelongsToCompany(companyId, dto.branch_id);
    if (!branchOk) throw badRequest('branch_invalid', 'شعبهٔ سند یافت نشد.');

    // ۲) هر سطر دقیقاً یک‌سمتی (بدهکار یا بستانکار) و بزرگ‌تر از صفر
    for (const l of dto.lines) {
      const debit = Number(l.debit ?? 0);
      const credit = Number(l.credit ?? 0);
      const hasDebit = Number.isFinite(debit) && debit > 0;
      const hasCredit = Number.isFinite(credit) && credit > 0;
      if (hasDebit === hasCredit) {
        throw badRequest(
          'line_one_side',
          'هر سطر سند باید دقیقاً یک سمت (بدهکار یا بستانکار) با مبلغ بزرگ‌تر از صفر داشته باشد.',
        );
      }
    }

    // ۳) حساب‌های سطرها باید وجود داشته و قابل ثبت (is_postable) باشند
    const accountIds = [...new Set(dto.lines.map((l) => l.account_id))];
    const accounts = await this.repo.resolveAccounts(companyId, accountIds);
    for (const id of accountIds) {
      const acc = accounts.get(id);
      if (!acc) throw badRequest('account_invalid', 'یکی از حساب‌های سند یافت نشد.');
      if (!acc.is_postable) {
        throw badRequest('account_not_postable', `حساب ${acc.code} قابل ثبت مستقیم نیست.`);
      }
    }

    // ۴) توازن سند (پیش‌بررسی برای پیام فارسی؛ تریگر fn_journal_balanced لایهٔ دوم)
    const totalDebit = sumDecimal(dto.lines.map((l) => l.debit));
    const totalCredit = sumDecimal(dto.lines.map((l) => l.credit));
    if (Math.abs(totalDebit - totalCredit) > 0.004) {
      throw unprocessable(
        'journal_unbalanced',
        `سند متوازن نیست: بدهکار ${totalDebit.toFixed(2)} / بستانکار ${totalCredit.toFixed(2)}.`,
      );
    }

    // ۵) دورهٔ مالی بازِ شامل تاریخ سند
    const periodId = await this.repo.resolveOpenPeriod(
      companyId,
      dto.entry_date,
      dto.fiscal_period_id,
    );
    if (!periodId) {
      throw unprocessable(
        'period_not_open',
        'دورهٔ مالی «باز» شامل این تاریخ یافت نشد؛ ابتدا دوره را باز کنید.',
      );
    }

    let id: string;
    try {
      id = await this.repo.insertJournal(companyId, userId, dto, periodId, {
        debit: totalDebit.toFixed(2),
        credit: totalCredit.toFixed(2),
      });
    } catch (err) {
      throw this.mapJournalError(err);
    }
    return this.getJournal(companyId, id);
  }

  // ---------------- Trial balance ----------------

  async trialBalance(
    companyId: string,
    query: TrialBalanceQueryDto,
  ): Promise<{ items: TrialBalanceRow[] }> {
    const items = await this.repo.trialBalance(companyId, query);
    return { items };
  }

  // ---------------- DB error mapping ----------------

  private mapJournalError(err: unknown): Error {
    const e = err as { code?: string; message?: string };
    // raise exception از fn_journal_balanced / fn_check_journal_period (پیام فارسی)
    if (e?.code === 'P0001') {
      return unprocessable('journal_rejected', e?.message ?? 'سند توسط قواعد پایگاه‌داده رد شد.');
    }
    if (e?.code === '23514') {
      return unprocessable('journal_unbalanced', 'سند متوازن نیست یا یک سطر دو سمت دارد.');
    }
    if (e?.code === '23505') {
      return conflict('duplicate_doc', 'سندی با این شماره قبلاً ثبت شده است.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های سند (حساب/شعبه/دوره) معتبر نیست.');
    }
    return badRequest('journal_save_failed', 'خطای غیرمنتظره در ثبت سند.');
  }

  private mapPeriodError(err: unknown): Error {
    const e = err as { code?: string };
    if (e?.code === '23505') {
      return conflict('duplicate_period', 'این دورهٔ مالی (سال/شماره) قبلاً ساخته شده است.');
    }
    if (e?.code === '23514') {
      return badRequest('invalid_range', 'بازهٔ دوره معتبر نیست (پایان باید ≥ شروع باشد).');
    }
    return badRequest('period_save_failed', 'خطای غیرمنتظره در ساخت دورهٔ مالی.');
  }
}
