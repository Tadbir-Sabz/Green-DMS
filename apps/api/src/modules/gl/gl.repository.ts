import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { DocNumberService } from '../../common/doc-number.service';
import { DOC_NUMBER_SERVICE } from '../../common/doc-number.service';
import type {
  CreateJournalDto,
  CreatePeriodDto,
  ListAccountsQueryDto,
  ListJournalsQueryDto,
  ListPeriodsQueryDto,
  TrialBalanceQueryDto,
} from './gl.dto';

/** یک حساب در درخت کدینگ — مطابق schemas.GlAccount */
export interface GlAccount extends QueryResultRow {
  id: string;
  code: string;
  parent_id: string | null;
  level: number;
  title: string;
  nature: string;
  account_type: string;
  is_postable: boolean;
  control_type: string | null;
  currency: string;
  is_active: boolean;
}

/** دوره مالی — مطابق schemas.FiscalPeriod */
export interface FiscalPeriod extends QueryResultRow {
  id: string;
  fiscal_year: number;
  period_no: number;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
}

/** یک سطر سند — مطابق schemas.JournalLine */
export interface JournalLine extends QueryResultRow {
  id: string;
  line_no: number;
  account_id: string;
  account_code?: string;
  account_title?: string;
  description: string;
  debit: string;
  credit: string;
  party_type: string | null;
  party_id: string | null;
  dimensions: Record<string, unknown>;
}

/** سند حسابداری — مطابق schemas.JournalEntry */
export interface JournalEntry extends QueryResultRow {
  id: string;
  branch_id: string | null;
  doc_number: string;
  fiscal_period_id: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id: string | null;
  total_debit: string;
  total_credit: string;
  status: string;
  reversal_of_id: string | null;
  posted_at: string | null;
  created_at: string;
  lines?: JournalLine[];
}

/** یک ردیف تراز آزمایشی — مطابق schemas.TrialBalanceRow */
export interface TrialBalanceRow extends QueryResultRow {
  fiscal_year: number;
  period_no: number;
  account_code: string;
  title: string;
  level: number;
  nature: string;
  debit_total: string;
  credit_total: string;
  balance: string;
}

const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * دفتر کل (ماژول ۹ / ضمیمه G.۱۵) — SQL زنده روی جداول مهاجرت 0018.
 *
 * یکپارچگی سند توسط خودِ پایگاه‌داده تضمین می‌شود، نه فقط اینجا:
 *  - fn_journal_balanced (تریگر deferred) در پایان تراکنش جمع بدهکار/بستانکار
 *    سطرها را برابر می‌خواهد؛
 *  - ck_journal_entry_balanced_check ستون‌های total را برای سند غیر draft برابر می‌خواهد؛
 *  - ck_journal_line_one_side هر سطر را دقیقاً یک‌سمتی می‌خواهد؛
 *  - fn_check_journal_period تاریخ سند را داخل بازهٔ دورهٔ «باز» می‌خواهد؛
 *  - fn_immutable_after_post سند صادرشده را قفل می‌کند.
 * این مخزن فقط داده را می‌نویسد و خطاهای خام DB را برای نگاشت به پیام فارسی بالا می‌دهد.
 */
@Injectable()
export class GlRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  // ---------------- Chart of accounts ----------------

  async listAccounts(
    companyId: string,
    query: ListAccountsQueryDto,
  ): Promise<{ items: GlAccount[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 200;
    const params: unknown[] = [companyId];
    const filters: string[] = ['company_id = $1'];
    if (query.nature) {
      params.push(query.nature);
      filters.push(`nature = $${params.length}`);
    }
    if (query.account_type) {
      params.push(query.account_type);
      filters.push(`account_type = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      filters.push(`code > $${params.length}`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<GlAccount>(
      `select id, code, parent_id, level, title, nature, account_type,
              is_postable, control_type, currency, is_active
         from gl_account
        where ${filters.join(' and ')}
        order by code
        limit ${limitParam}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.code) : null,
    };
  }

  /** حساب‌های متعلق به این شرکت — برای اعتبارسنجی سطرها (وجود + قابل ثبت بودن) */
  async resolveAccounts(
    companyId: string,
    accountIds: string[],
  ): Promise<Map<string, { is_postable: boolean; code: string }>> {
    const map = new Map<string, { is_postable: boolean; code: string }>();
    if (accountIds.length === 0) return map;
    const { rows } = await this.pool.query<{ id: string; is_postable: boolean; code: string }>(
      `select id, is_postable, code from gl_account
        where company_id = $1 and id = any($2::uuid[])`,
      [companyId, accountIds],
    );
    for (const r of rows) map.set(r.id, { is_postable: r.is_postable, code: r.code });
    return map;
  }

  async branchBelongsToCompany(companyId: string, branchId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from branch where id = $1 and company_id = $2`,
      [branchId, companyId],
    );
    return rows.length > 0;
  }

  // ---------------- Fiscal periods ----------------

  async listPeriods(
    companyId: string,
    query: ListPeriodsQueryDto,
  ): Promise<FiscalPeriod[]> {
    const params: unknown[] = [companyId];
    const filters: string[] = ['company_id = $1'];
    if (query.fiscal_year != null) {
      params.push(query.fiscal_year);
      filters.push(`fiscal_year = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    const { rows } = await this.pool.query<FiscalPeriod>(
      `select id, fiscal_year, period_no, start_date::text, end_date::text, status, closed_at
         from fiscal_period
        where ${filters.join(' and ')}
        order by fiscal_year desc, period_no desc`,
      params,
    );
    return rows;
  }

  async findPeriod(companyId: string, id: string): Promise<FiscalPeriod | null> {
    const { rows } = await this.pool.query<FiscalPeriod>(
      `select id, fiscal_year, period_no, start_date::text, end_date::text, status, closed_at
         from fiscal_period where id = $1 and company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** دورهٔ «باز» شامل یک تاریخ — یا همان period_id اگر داده شده و معتبر باشد */
  async resolveOpenPeriod(
    companyId: string,
    entryDate: string,
    periodId?: string,
  ): Promise<string | null> {
    if (periodId) {
      const { rows } = await this.pool.query<{ id: string }>(
        `select id from fiscal_period
          where id = $1 and company_id = $2 and status = 'open'
            and start_date <= $3::date and end_date >= $3::date`,
        [periodId, companyId, entryDate],
      );
      return rows[0]?.id ?? null;
    }
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from fiscal_period
        where company_id = $1 and status = 'open'
          and start_date <= $2::date and end_date >= $2::date
        order by period_no limit 1`,
      [companyId, entryDate],
    );
    return rows[0]?.id ?? null;
  }

  async insertPeriod(companyId: string, dto: CreatePeriodDto): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into fiscal_period (company_id, fiscal_year, period_no, start_date, end_date, status)
       values ($1, $2, $3, $4, $5, 'open')
       returning id`,
      [companyId, dto.fiscal_year, dto.period_no, dto.start_date, dto.end_date],
    );
    return rows[0].id;
  }

  /** بستن دوره فقط اگر open باشد؛ در غیر این صورت null (هیچ ردیفی به‌روز نشد) */
  async closePeriod(
    companyId: string,
    id: string,
    userId: string,
  ): Promise<FiscalPeriod | null> {
    const { rows } = await this.pool.query<FiscalPeriod>(
      `update fiscal_period
          set status = 'closed', closed_by = $3, closed_at = now()
        where id = $1 and company_id = $2 and status = 'open'
        returning id, fiscal_year, period_no, start_date::text, end_date::text, status, closed_at`,
      [id, companyId, userId],
    );
    return rows[0] ?? null;
  }

  // ---------------- Journal entries ----------------

  async listJournals(
    companyId: string,
    query: ListJournalsQueryDto,
  ): Promise<{ items: JournalEntry[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const filters: string[] = ['company_id = $1'];
    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.source_type) {
      params.push(query.source_type);
      filters.push(`source_type = $${params.length}`);
    }
    if (query.fiscal_period_id) {
      params.push(query.fiscal_period_id);
      filters.push(`fiscal_period_id = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      filters.push(`entry_date >= $${params.length}::date`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`entry_date <= $${params.length}::date`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      filters.push(`doc_number > $${params.length}`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<JournalEntry>(
      `select id, branch_id, doc_number, fiscal_period_id, entry_date::text, description,
              source_type, source_id, total_debit::text, total_credit::text,
              status, reversal_of_id, posted_at, created_at
         from journal_entry
        where ${filters.join(' and ')}
        order by doc_number
        limit ${limitParam}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.doc_number) : null,
    };
  }

  async findJournal(
    companyId: string,
    id: string,
  ): Promise<JournalEntry | null> {
    const entry = await this.pool.query<JournalEntry>(
      `select id, branch_id, doc_number, fiscal_period_id, entry_date::text, description,
              source_type, source_id, total_debit::text, total_credit::text,
              status, reversal_of_id, posted_at, created_at
         from journal_entry where id = $1 and company_id = $2`,
      [id, companyId],
    );
    const head = entry.rows[0];
    if (!head) return null;
    const lines = await this.pool.query<JournalLine>(
      `select l.id::text as id, l.line_no, l.account_id, a.code as account_code,
              a.title as account_title, l.description, l.debit::text, l.credit::text,
              l.party_type, l.party_id, l.dimensions
         from journal_line l
         join gl_account a on a.id = l.account_id
        where l.entry_id = $1
        order by l.line_no`,
      [id],
    );
    head.lines = lines.rows;
    return head;
  }

  /**
   * ثبت و صدور سند دستی در یک تراکنش: هدر (status='posted') + سطرها.
   * توازن در commit توسط fn_journal_balanced (deferred) بازبینی می‌شود؛ اگر سطرها
   * نابرابر باشند commit با خطای check_violation شکست می‌خورد و rollback می‌شود.
   */
  async insertJournal(
    companyId: string,
    userId: string,
    dto: CreateJournalDto,
    fiscalPeriodId: string,
    totals: { debit: string; credit: string },
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { doc_number } = await this.docNumbers.next(dto.branch_id, 'journal', { client });
      const id = randomUUID();
      await client.query(
        `insert into journal_entry
           (id, company_id, branch_id, doc_number, fiscal_period_id, entry_date,
            description, source_type, total_debit, total_credit, status,
            created_by, posted_by, posted_at)
         values ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9,'posted',$10,$10, now())`,
        [
          id,
          companyId,
          dto.branch_id,
          doc_number,
          fiscalPeriodId,
          dto.entry_date,
          dto.description,
          totals.debit,
          totals.credit,
          userId,
        ],
      );
      let lineNo = 1;
      for (const l of dto.lines) {
        await client.query(
          `insert into journal_line
             (entry_id, line_no, account_id, description, debit, credit,
              dimensions, party_type, party_id)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
          [
            id,
            lineNo++,
            l.account_id,
            l.description,
            l.debit ?? '0',
            l.credit ?? '0',
            JSON.stringify(l.dimensions ?? {}),
            l.party_type ?? null,
            l.party_id ?? null,
          ],
        );
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------- Trial balance ----------------

  async trialBalance(
    companyId: string,
    query: TrialBalanceQueryDto,
  ): Promise<TrialBalanceRow[]> {
    const params: unknown[] = [companyId];
    const filters: string[] = ['company_id = $1'];
    if (query.fiscal_year != null) {
      params.push(query.fiscal_year);
      filters.push(`fiscal_year = $${params.length}`);
    }
    if (query.period_no != null) {
      params.push(query.period_no);
      filters.push(`period_no = $${params.length}`);
    }
    const { rows } = await this.pool.query<TrialBalanceRow>(
      `select fiscal_year, period_no, account_code, title, level, nature,
              debit_total::text, credit_total::text, balance::text
         from v_trial_balance
        where ${filters.join(' and ')}
        order by account_code`,
      params,
    );
    return rows;
  }
}
