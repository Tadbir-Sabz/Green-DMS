import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateReturnDto, ListReturnsQueryDto, ReceiveReturnDto } from './return.dto';
import type { ReturnLineRow, ReturnRepository, ReturnRow } from './return.repository';
import { RETURN_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

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
  lines?: {
    product_id: string;
    batch_id: string | null;
    qty: number;
    qty_approved: number | null;
    disposition: string;
  }[];
}

const mapLine = (l: ReturnLineRow) => ({
  product_id: l.product_id,
  batch_id: l.batch_id,
  qty: l.qty,
  qty_approved: l.qty_approved,
  disposition: l.disposition,
});

@Injectable()
export class ReturnService {
  constructor(@Inject(RETURN_REPOSITORY) private readonly repo: ReturnRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListReturnsQueryDto): Promise<Page<ReturnRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<ReturnView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست مرجوعی یافت نشد' });
    const lines = await this.repo.findLines(id);
    return { ...row, lines: lines.map(mapLine) };
  }

  async create(companyId: string, dto: CreateReturnDto): Promise<ReturnView> {
    if (!dto.lines?.length) {
      throw badRequest('lines_required', 'درخواست مرجوعی باید حداقل یک قلم کالا داشته باشد.');
    }
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async approve(companyId: string, id: string): Promise<ReturnView> {
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
    const ok = await this.repo.approve(companyId, id);
    if (!ok) {
      throw new ConflictException({ code: 'invalid_transition', message_fa: 'وضعیت درخواست هم‌زمان تغییر کرده است.' });
    }
    return this.get(companyId, id);
  }

  async receive(companyId: string, id: string, dto: ReceiveReturnDto): Promise<ReturnView> {
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
    const lines = await this.repo.findLines(id);
    const known = new Set(lines.map((l) => l.product_id));
    if (dto.lines.some((l) => !known.has(l.product_id))) {
      throw badRequest('line_not_found', 'یکی از کالاهای ارسالی در این مرجوعی ثبت نشده است.');
    }
    const ok = await this.repo.receive(companyId, id, dto);
    if (!ok) {
      throw new ConflictException({ code: 'invalid_transition', message_fa: 'وضعیت درخواست هم‌زمان تغییر کرده است.' });
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e?.message === 'customer not found') {
      return badRequest('customer_not_found', 'مشتری ارسال‌شده در این شرکت یافت نشد.');
    }
    if (e?.message === 'invoice not found') {
      return badRequest('invoice_not_found', 'فاکتور ارسال‌شده در این شرکت یافت نشد.');
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
