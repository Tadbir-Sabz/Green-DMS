import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../../database/database.module';

export type IntegrationJobType = 'moadian.invoice' | 'psp.charge';

export interface IntegrationJob {
  type: IntegrationJobType | string;
  payload: Record<string, unknown>;
}

export interface EnqueuedJob {
  id: string;
  status: string;
}

const MAX_ATTEMPTS = 3;
/** backoff نمایی: ۵، ۱۰، ۲۰ ثانیه بین تلاش‌ها */
const RETRY_BASE_SECONDS = 5;
const TICK_MS = 5_000;
const BATCH_SIZE = 5;

/**
 * صف یکپارچه‌سازی‌ها — فاز B: از آرایهٔ درون‌حافظه («simulate») به جدول‌های
 * پایدار moadian_submission و psp_transaction منتقل شد.
 *
 * - enqueue هر شغل را به‌صورت ردیف با وضعیت queued ثبت می‌کند؛
 * - processDue هر ۵ ثانیه سررسیده‌ها را با UPDATE اتمیک برمی‌دارد (FOR UPDATE
 *   SKIP LOCKED داخل زیرپرسش) تا چند نمونه همزمان شغل تکراری برندارند؛
 * - شکست → attempt_count + 1 و next_retry_at با backoff نمایی؛ پس از MAX_ATTEMPTS
 *   به dead می‌رود و last_error برای نمایش می‌ماند؛
 * - بدون Redis هم کار می‌کند (زمان‌بند داخل پروسه است) و با onModuleDestroy
 *   متوقف می‌شود تا تست‌ها پروسه را آزاد کنند.
 */
@Injectable()
export class IntegrationsQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('IntegrationsQueue');
  private timer?: ReturnType<typeof setInterval>;

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.processDue().catch((err: unknown) => {
        this.logger.error('پردازش دوره‌ای صف یکپارچه‌سازی شکست خورد', err instanceof Error ? err.stack : String(err));
      });
    }, TICK_MS);
    // از نگه‌داشتن پروسه (یا worker تست) جلوگیری می‌کند
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** ثبت پایدار شغل — همان قرارداد پاسخ قبلی (id + status) */
  async enqueue(job: IntegrationJob): Promise<EnqueuedJob> {
    const payload = job.payload ?? {};
    if (job.type === 'moadian.invoice') {
      const invoiceId = payload.invoice_id;
      if (typeof invoiceId !== 'string' || !invoiceId) {
        throw new BadRequestException({
          code: 'invoice_id_required',
          message_fa: 'برای ارسال به سامانه مؤدیان، شناسه فاکتور (invoice_id) الزامی است.',
        });
      }
      const { rows } = await this.pool.query<{ id: string; status: string }>(
        `insert into moadian_submission (invoice_id, payload, status, next_retry_at)
         values ($1, $2::jsonb, 'queued', now())
         returning id, status`,
        [invoiceId, JSON.stringify(payload)],
      );
      return rows[0];
    }

    if (job.type === 'psp.charge') {
      const missing = (['branch_id', 'terminal_id', 'psp', 'amount'] as const).filter(
        (key) => payload[key] === undefined || payload[key] === null || payload[key] === '',
      );
      if (missing.length > 0) {
        throw new BadRequestException({
          code: 'missing_fields',
          message_fa: 'برای درخواست پرداخت فیلدهای الزامی ناقص است.',
          details: { fields: missing },
        });
      }
      const { rows } = await this.pool.query<{ id: string; status: string }>(
        `insert into psp_transaction
           (branch_id, terminal_id, psp, amount, txn_at, status, raw_payload, attempt_count, next_retry_at)
         values ($1::uuid, $2, $3, $4::numeric, coalesce($5::timestamptz, now()), 'queued', $6::jsonb, 0, now())
         returning id, status`,
        [
          String(payload.branch_id),
          String(payload.terminal_id),
          String(payload.psp),
          String(payload.amount),
          payload.txn_at ? String(payload.txn_at) : null,
          JSON.stringify(payload),
        ],
      );
      return rows[0];
    }

    throw new BadRequestException({
      code: 'unsupported_job',
      message_fa: 'نوع شغل پشتیبانی نمی‌شود.',
      details: { type: job.type },
    });
  }

  /** فهرست شغل‌های اخیر هر دو صف (برای /integrations/moadian/status و reconcile) */
  async list(): Promise<{ moadian: unknown[]; psp: unknown[] }> {
    const [moadian, psp] = await Promise.all([
      this.pool.query(
        `select id, invoice_id, status, attempt_count, last_error,
                next_retry_at::text as next_retry_at, created_at::text as created_at
           from moadian_submission order by created_at desc limit 50`,
      ),
      this.pool.query(
        `select id, psp, terminal_id, amount::text as amount, status, attempt_count, last_error,
                next_retry_at::text as next_retry_at, created_at::text as created_at
           from psp_transaction order by created_at desc limit 50`,
      ),
    ]);
    return { moadian: moadian.rows, psp: psp.rows };
  }

  /** یک نوبت پردازش همهٔ شغل‌های سررسیدشده — برای زمان‌بند و تست دستی */
  async processDue(): Promise<{ processed: number }> {
    const moadian = await this.processMoadianBatch();
    const psp = await this.processPspBatch();
    return { processed: moadian + psp };
  }

  private async processMoadianBatch(): Promise<number> {
    const { rows: due } = await this.pool.query<{ id: string; payload: unknown; attempt_count: number }>(
      `update moadian_submission set status = 'sending'
        where id in (
          select id from moadian_submission
           where status in ('queued', 'retrying')
             and (next_retry_at is null or next_retry_at <= now())
           order by created_at
           limit $1
           for update skip locked)
        returning id, payload, attempt_count`,
      [BATCH_SIZE],
    );

    for (const row of due) {
      try {
        await this.sendToMoadian(row.payload as Record<string, unknown>);
        await this.pool.query(
          `update moadian_submission
              set status = 'sent', sent_at = now(), last_error = null, next_retry_at = null
            where id = $1`,
          [row.id],
        );
      } catch (err) {
        await this.markFailure('moadian_submission', row.id, row.attempt_count, err);
      }
    }
    return due.length;
  }

  private async processPspBatch(): Promise<number> {
    const { rows: due } = await this.pool.query<{ id: string; raw_payload: unknown; attempt_count: number }>(
      `update psp_transaction set status = 'sending'
        where id in (
          select id from psp_transaction
           where status in ('queued', 'retrying')
             and (next_retry_at is null or next_retry_at <= now())
           order by created_at
           limit $1
           for update skip locked)
        returning id, raw_payload, attempt_count`,
      [BATCH_SIZE],
    );

    for (const row of due) {
      try {
        await this.chargeViaPsp(row.raw_payload as Record<string, unknown>);
        await this.pool.query(
          `update psp_transaction set status = 'success', last_error = null, next_retry_at = null where id = $1`,
          [row.id],
        );
      } catch (err) {
        await this.markFailure('psp_transaction', row.id, row.attempt_count, err);
      }
    }
    return due.length;
  }

  /** ارسال واقعی به سامانه مؤدیان — بدون پیکربندی endpoint شکست می‌خورد و retry می‌شود */
  private async sendToMoadian(payload: Record<string, unknown>): Promise<void> {
    const endpoint = process.env.MOADIAN_ENDPOINT;
    if (!endpoint) throw new Error('moadian_not_configured');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.MOADIAN_API_KEY ? { authorization: `Bearer ${process.env.MOADIAN_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`moadian_http_${res.status}`);
  }

  /** شارژ از طریق درگاه PSP — بدون endpoint شکست می‌خورد و retry می‌شود */
  private async chargeViaPsp(payload: Record<string, unknown>): Promise<void> {
    const endpoint = process.env.PSP_ENDPOINT;
    if (!endpoint) throw new Error('psp_not_configured');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.PSP_API_KEY ? { authorization: `Bearer ${process.env.PSP_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`psp_http_${res.status}`);
  }

  /** ثبت شکست با backoff نمایی یا dead شدن پس از سقف تلاش‌ها */
  private async markFailure(
    table: 'moadian_submission' | 'psp_transaction',
    id: string,
    previousAttempts: number,
    err: unknown,
  ): Promise<void> {
    const attempts = previousAttempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = attempts >= MAX_ATTEMPTS;
    const delaySeconds = RETRY_BASE_SECONDS * 2 ** (attempts - 1);

    await this.pool.query(
      `update ${table}
          set status = $2,
              attempt_count = $3,
              last_error = $4,
              next_retry_at = ${exhausted ? 'null' : `now() + ($5 * interval '1 second')`}
        where id = $1`,
      exhausted ? [id, 'dead', attempts, message] : [id, 'retrying', attempts, message, delaySeconds],
    );

    if (exhausted) {
      this.logger.warn(`شغل ${table}/${id} پس از ${attempts} تلاش متوقف شد: ${message}`);
    }
  }
}
