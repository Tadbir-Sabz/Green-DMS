import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateReturnDto, ListReturnsQueryDto, ReceiveReturnDto } from './return.dto';
import type { StockMovementActor } from '../inventory/ledger/stock-movement';
import type { ReturnLineRow, ReturnRepository, ReturnRow } from './return.repository';
import { CREDIT_NOTE_REPOSITORY, RETURN_REPOSITORY } from './tokens';
import { RULES_ENGINE_SERVICE } from '../rules-engine/rules-engine.tokens';
import type { RulesEngineService } from '../rules-engine/rules-engine.service';
import { ResolutionPlanError, findDuplicateIds } from './return-resolution';
import { CreditNoteReferenceError, type CreditNoteRepository } from './credit-note.repository';
import { CreditNoteError } from './credit-note';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

/** خلاصهٔ یادداشت بستانکارِ متصل (null اگر هنوز صادر نشده) */
export interface ReturnCreditNoteSummary {
  id: string;
  doc_number: string;
  amount: string;
  status: string;
  issued_at: string;
}

/**
 * TASK-P4-FC — وضعیت مالیِ مشتق‌شده (هرگز ذخیره نمی‌شود؛ از روی داده محاسبه می‌شود):
 *   awaiting_receipt       — پیش از receive (سند posted نشده)
 *   awaiting_credit_note   — دریافت شده، بستانکار صادر نشده
 *   credit_note_issued     — یادداشت بستانکار ثبت شده (صرف‌نظر از وضعیت ارزش‌گذاری)
 * «financial closure» واقعی به valuation_status هم نیاز دارد — OD-01.
 */
export type FinancialStatus = 'awaiting_receipt' | 'awaiting_credit_note' | 'credit_note_issued';

export const financialStatusOf = (row: {
  status: string;
  credit_note_id: string | null;
}): FinancialStatus => {
  if (row.status !== 'posted' && row.status !== 'closed') return 'awaiting_receipt';
  return row.credit_note_id ? 'credit_note_issued' : 'awaiting_credit_note';
};

export interface ReturnView {
  id: string;
  doc_number: string;
  customer_id: string;
  invoice_id: string | null;
  tour_id: string | null;
  reason_code: string;
  status: string;
  credit_note_id: string | null;
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  /** TASK-P4-FC — وضعیت صریحِ ارزش‌گذاریِ بهای تمام‌شده (migration 0067) */
  valuation_status: string;
  /** TASK-P4-FC — وضعیت مالیِ مشتق‌شده */
  financial_status: FinancialStatus;
  /** TASK-P4-FC — خلاصهٔ یادداشت بستانکار (فقط در پاسخ تکی) */
  credit_note?: ReturnCreditNoteSummary | null;
  lines?: {
    product_id: string;
    batch_id: string | null;
    qty: number;
    qty_approved: number | null;
    disposition: string;
    invoice_line_id: string | null;
  }[];
}

const mapLine = (l: ReturnLineRow) => ({
  product_id: l.product_id,
  batch_id: l.batch_id,
  qty: l.qty,
  qty_approved: l.qty_approved,
  disposition: l.disposition,
  invoice_line_id: l.invoice_line_id ?? null,
});

@Injectable()
export class ReturnService {
  constructor(
    @Inject(RETURN_REPOSITORY) private readonly repo: ReturnRepository,
    /** TASK-24Y — همان دروازهٔ تأییدِ قابلِ استفادهٔ مجدد (بدونِ تکرارِ منطق) */
    @Inject(RULES_ENGINE_SERVICE) private readonly rules: RulesEngineService,
    /** TASK-P4-FC — صدور یادداشت بستانکار (دفتر مشتری/AR) */
    @Inject(CREDIT_NOTE_REPOSITORY) private readonly creditNotes: CreditNoteRepository,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListReturnsQueryDto): Promise<Page<ReturnRow & { financial_status: FinancialStatus }>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return {
      items: items.map((r) => ({ ...r, financial_status: financialStatusOf(r) })),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async get(companyId: string, id: string): Promise<ReturnView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست مرجوعی یافت نشد' });
    const lines = await this.repo.findLines(id);
    const creditNote = await this.creditNotes.findSummaryByReturnId(id);
    return {
      ...row,
      financial_status: financialStatusOf(row),
      credit_note: creditNote,
      lines: lines.map(mapLine),
    };
  }

  async create(
    companyId: string,
    dto: CreateReturnDto,
    actorUserId: string | null = null,
  ): Promise<ReturnView> {
    if (!dto.lines?.length) {
      throw badRequest('lines_required', 'درخواست مرجوعی باید حداقل یک قلم کالا داشته باشد.');
    }
    const dups = findDuplicateIds(dto.lines.map((l) => l.product_id));
    if (dups.length > 0) {
      // TASK-P4-R-HARDEN: یک خط ذخیره‌شده هرگز دو posting نمی‌سازد
      throw new BadRequestException({
        code: 'duplicate_line',
        message_fa: 'هر کالا فقط یک‌بار در خطوط درخواست مرجوعی می‌تواند تکرار شود.',
        details: { product_ids: dups },
      });
    }
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto, actorUserId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  /**
   * TASK-24Y — تأییدِ مرجوعی از همان دروازهٔ قابلِ استفادهٔ مجدد.
   *
   * پیش از این فقط `status` بررسی می‌شد: یک نفر با مجوز می‌توانست مرجوعیِ
   * خودش را تأیید کند و هیچ زنجیره/تصمیمی ثبت نمی‌شد. `requested_by` از قبل
   * در جدول بود ولی خوانده نمی‌شد — ستونِ بی‌استفاده یعنی کنترلِ ناموجود.
   */
  /**
   * TASK-24Z · Phase A — ارسالِ مرجوعی به گردشِ تأیید (ساختِ درخواست + اتصال).
   */
  async requestApproval(
    companyId: string,
    id: string,
    actorUserId: string,
  ): Promise<{ approval_request_id: string; current_step: number; expires_at: string | null; stages: number }> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست مرجوعی یافت نشد' });
    if (row.status !== 'submitted') {
      throw new ConflictException({
        code: 'invalid_transition',
        message_fa: 'فقط مرجوعیِ ثبت‌شده (submitted) قابلِ ارسال به گردشِ تأیید است.',
        details: { status: row.status },
      });
    }
    const started = await this.rules.submitForApproval(companyId, {
      operation: 'sales.return.approve',
      entityType: 'return_request',
      entityId: id,
      requestedBy: row.requested_by ?? actorUserId,
    });
    return {
      approval_request_id: started.approvalRequestId,
      current_step: started.currentStep,
      expires_at: started.expiresAt,
      stages: started.stages,
    };
  }

  async approve(companyId: string, id: string, actorUserId: string): Promise<ReturnView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست مرجوعی یافت نشد' });
    if (row.status !== 'submitted') {
      throw new ConflictException({
        code: 'invalid_transition',
        message_fa: 'فقط درخواست‌های در انتظار تأیید قابل تأیید هستند.',
        details: { status: row.status },
      });
    }

    // جداسازیِ وظایف
    if (row.requested_by && row.requested_by === actorUserId) {
      throw new ForbiddenException({
        code: 'self_approval_forbidden',
        message_fa: 'تأییدِ مرجوعی‌ای که خودتان ثبت کرده‌اید مجاز نیست؛ تأییدکننده باید شخصِ دیگری باشد.',
      });
    }

    // دروازهٔ سیاست — فقط اگر سیاستی برای این عملیات تعریف شده باشد
    const policies = await this.rules.listPoliciesForOperation(companyId, 'sales.return.approve');
    if (policies.length === 0) {
      const ok = await this.repo.approve(companyId, id);
      if (!ok) {
        throw new ConflictException({ code: 'invalid_transition', message_fa: 'وضعیت درخواست هم‌زمان تغییر کرده است.' });
      }
      return this.get(companyId, id);
    }

    // TASK-24Z · Phase B — مصرف + گذار در یک تراکنش (یافتهٔ D-1).
    await this.rules.consumeApprovedBinding(
      companyId,
      { operation: 'sales.return.approve', entityType: 'return_request', entityId: id },
      async (client) => {
        const ok = await this.repo.approve(companyId, id, client);
        if (!ok) {
          throw new ConflictException({
            code: 'invalid_transition',
            message_fa: 'وضعیت درخواست هم‌زمان تغییر کرده است.',
          });
        }
      },
    );
    return this.get(companyId, id);
  }

  async receive(
    companyId: string,
    id: string,
    dto: ReceiveReturnDto,
    actor: StockMovementActor,
  ): Promise<ReturnView> {
    this.assertId(id);
    if (!dto.lines.length) {
      throw badRequest('lines_required', 'دریافت مرجوعی باید تکلیف حداقل یک قلم را مشخص کند.');
    }
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست مرجوعی یافت نشد' });
    if (row.status !== 'approved' && row.status !== 'partially_approved') {
      throw new ConflictException({
        code: 'invalid_transition',
        message_fa: 'فقط مرجوعی‌های تأییدشده قابل دریافت هستند.',
        details: { status: row.status },
      });
    }
    // اعتبارسنجی کامل (تکراری، پوشش خط‌به‌خط، qty، چرخهٔ partially_approved)
    // داخلِ همان تراکنشِ مخزن انجام می‌شود — هیچ «نصفه» پُست نمی‌شود.
    const ok = await this.repo.receive(companyId, id, dto, actor).catch((err: unknown) => {
      if (err instanceof ResolutionPlanError) {
        if (err.httpStatus === 400) {
          throw new BadRequestException({
            code: err.code,
            message_fa: err.message,
            ...(err.details ? { details: err.details } : {}),
          });
        }
        throw new ConflictException({
          code: err.code,
          message_fa: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
      }
      // بکاپِ قیدِ DB — در حالت عادی با qty_exceeds_requested پیشاپیش گرفته می‌شود
      const e = err as { code?: string } | null;
      if (e?.code === '23514') {
        throw badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
      }
      throw this.mapDbError(err);
    });
    if (!ok) {
      throw new ConflictException({ code: 'invalid_transition', message_fa: 'وضعیت درخواست هم‌زمان تغییر کرده است.' });
    }
    return this.get(companyId, id);
  }

  /**
   * TASK-P4-FC — صدور یادداشت بستانکار برای یک مرجوعیِ posted.
   * مستقل از receive است (traceability جدا)؛ در یک تراکنش انجام می‌شود؛
   * دوبار‌صدور (حتی رقابتی) با 409 رد می‌شود.
   */
  async issueCreditNote(companyId: string, id: string, actorUserId: string | null = null): Promise<ReturnView> {
    this.assertId(id);
    try {
      const result = await this.creditNotes.issueCreditNote(companyId, id, actorUserId);
      if (result.ok !== true) {
        if (result.reason === 'not_found') {
          throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست مرجوعی یافت نشد' });
        }
        if (result.reason === 'not_posted') {
          throw new ConflictException({
            code: 'invalid_transition',
            message_fa: 'صدور یادداشت بستانکار فقط پس از receive (ثبت نهایی) ممکن است.',
            details: { status: result.status },
          });
        }
        throw new ConflictException({
          code: 'already_credited',
          message_fa: 'برای این مرجوعی یادداشت بستانکار قبلاً صادر شده است.',
          details: { credit_note_id: result.credit_note_id },
        });
      }
      return this.get(companyId, id);
    } catch (err) {
      if (err instanceof CreditNoteReferenceError) {
        const ErrorType = err.code === 'credit_disposition_unresolved' || err.code === 'invoice_not_eligible'
          ? ConflictException
          : BadRequestException;
        throw new ErrorType({
          code: err.code,
          message_fa: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
      }
      if (err instanceof CreditNoteError) {
        throw new ConflictException({
          code: err.code,
          message_fa: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
      }
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException({
          code: 'duplicate_doc',
          message_fa: 'شمارهٔ سند بستانکار تکراری است؛ دوباره تلاش کنید.',
        });
      }
      throw err;
    }
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string; message?: string; pgCode?: string; details?: Record<string, unknown> };
    if (e?.message === 'customer not found') {
      return badRequest('customer_not_found', 'مشتری ارسال‌شده در این شرکت یافت نشد.');
    }
    if (e?.message === 'invoice not found') {
      return badRequest('invoice_not_found', 'فاکتور ارسال‌شده در این شرکت یافت نشد.');
    }
    // TASK-P4-FC — خطاهای پیوندِ فاکتور/قلم و سقفِ eligibility
    if (e?.pgCode === 'no_data' && e?.message === 'invoice line not found') {
      return badRequest('invoice_line_not_found', 'یکی از خطوط فاکتورِ متصل یافت نشد.');
    }
    if (e?.pgCode === 'mixed_invoice') {
      return badRequest(
        'invoice_line_mismatch',
        'خطوط فاکتورِ متصل متعلق به یک فاکتور نیستند یا با فاکتورِ ارسالی همخوانی ندارند.',
      );
    }
    if (e?.pgCode === 'invoice_not_eligible') {
      return new BadRequestException({
        code: 'invoice_not_eligible',
        message_fa: 'مرجوعی فقط برای فاکتورهای ثبت‌شده و تسویه‌نشده/تسویه‌شده مجاز است؛ پیش‌نویس و ابطال‌شده پذیرفته نیستند.',
        ...(e.details ? { details: e.details } : {}),
      });
    }
    if (e?.pgCode === 'invoice_customer') {
      return badRequest('invoice_customer_mismatch', 'فاکتورِ متصل متعلق به این مشتری نیست.');
    }
    if (e?.pgCode === 'line_product') {
      return new BadRequestException({
        code: 'line_product_mismatch',
        message_fa: 'کالای یک قلم با خطِ فاکتورِ متصل یکسان نیست.',
        ...(e.details ? { details: e.details } : {}),
      });
    }
    if (e?.pgCode === 'qty_exceeds_invoiced') {
      return new BadRequestException({
        code: 'qty_exceeds_invoiced',
        message_fa: 'مقدار مرجوعی از باقی‌ماندهٔ قابلِ مرجوعیِ خطِ فاکتور بیشتر است.',
        ...(e.details ? { details: e.details } : {}),
      });
    }
    if (e?.code === '23505') {
      return new BadRequestException({
        code: 'duplicate_doc',
        message_fa: 'شماره سند مرجوعی در این شعبه تکراری است.',
        details: { constraint: e.constraint },
      });
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    return badRequest('return_save_failed', 'خطای غیرمنتظره در ثبت مرجوعی.');
  }
}
