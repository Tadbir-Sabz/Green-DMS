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
import { runAsJobTenant } from '../../../database/job-context';

export type IntegrationJobType = 'moadian.invoice' | 'psp.charge';

export interface IntegrationJob {
  type: IntegrationJobType | string;
  payload: Record<string, unknown>;
}

export interface EnqueuedJob {
  id: string;
  status: string;
}

/**
 * یک شغلِ برداشته‌شده توسطِ fn_job_claim_integration (مهاجرتِ 0044).
 *
 * company_id/branch_id از «رکوردِ پایدارِ قابلِ اعتماد» مشتق شده‌اند
 * (moadian_submission.invoice_id → invoice.branch_id → branch.company_id و
 *  psp_transaction.branch_id → branch.company_id)، **نه** از payloadِ شغل.
 * company_id تهی یعنی اجاره قابلِ اشتقاق نیست ⇒ شغل باید fail-closed بمیرد.
 */
export interface ClaimedJob {
  kind: 'moadian' | 'psp';
  job_id: string;
  company_id: string | null;
  branch_id: string | null;
  attempt_count: number;
  payload: string | null;
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

  /**
   * یک نوبتِ پردازشِ همهٔ شغل‌هایِ سررسیده — برایِ زمان‌بند و تستِ دستی.
   *
   * از 0044 این مسیر «اجاره‌محور» است:
   *   ۱) برداشتنِ شغل با fn_job_claim_integration (SECURITY DEFINER، lock اتمیکِ
   *      FOR UPDATE SKIP LOCKED) که همزمان اجارهٔ هر شغل را از رکوردِ پایدار مشتق می‌کند؛
   *   ۲) کارِ هر شغل و نوشتنِ وضعیتش **داخلِ زمینهٔ همان اجاره** اجرا می‌شود
   *      (runAsJobTenant) ⇒ همهٔ UPDATEها زیرِ RLS و در دامنهٔ درستِ اجاره‌اند و اگر دامنهٔ
   *      اشتقاق‌شده غلط باشد، به‌جایِ «موفقِ بی‌صدا»، صفر ردیف می‌خورد و خطا می‌دهد؛
   *   ۳) شغلی که اجاره‌اش قابلِ اشتقاق نیست با fn_job_mark_dead و دلیلِ صریح می‌میرد.
   * payload فقط به سرویسِ بیرونی می‌رود و هرگز منبعِ هویتِ اجاره نیست.
   */
  async processDue(): Promise<{ processed: number }> {
    const { rows } = await this.pool.query<ClaimedJob>(
      `select kind, job_id, company_id, branch_id, attempt_count, payload
         from fn_job_claim_integration($1)`,
      [BATCH_SIZE],
    );
    for (const job of rows) {
      await this.runClaimed(job);
    }
    return { processed: rows.length };
  }

  /** اجرایِ یک شغلِ برداشته‌شده در زمینهٔ اجارهٔ مشتق‌شده از رکوردِ پایدار. */
  private async runClaimed(job: ClaimedJob): Promise<void> {
    const payload = this.parsePayload(job);

    // fail-closed: بدونِ اجارهٔ قابلِ اشتقاق، هیچ کاری انجام و هیچ موفقیتی ثبت نمی‌شود.
    if (!job.company_id) {
      this.logger.error(
        `شغلِ ${job.kind}/${job.job_id} اجارهٔ قابلِ اشتقاق از رکوردِ پایدار ندارد ⇒ مرده ثبت می‌شود (بدونِ اجرایِ بی‌صدا)`,
      );
      await this.pool.query(`select fn_job_mark_dead($1, $2, $3)`, [
        job.kind,
        job.job_id,
        'tenant_unresolvable',
      ]);
      return;
    }

    try {
      await runAsJobTenant(this.pool, job.company_id, async () => {
        if (job.kind === 'moadian') {
          await this.sendToMoadian(payload);
        } else {
          await this.chargeViaPsp(payload);
        }
        await this.settleSuccess(job);
      });
    } catch (err) {
      // ثبتِ شکست هم باید داخلِ همان زمینهٔ اجاره باشد وگرنه زیرِ RLS صفر ردیف می‌خورد.
      try {
        await runAsJobTenant(this.pool, job.company_id, () =>
          this.markFailure(
            job.kind === 'moadian' ? 'moadian_submission' : 'psp_transaction',
            job.job_id,
            job.attempt_count,
            err,
          ),
        );
      } catch (innerErr) {
        this.logger.error(
          `ثبتِ شکستِ شغلِ ${job.kind}/${job.job_id} ممکن نشد`,
          innerErr instanceof Error ? innerErr.stack : String(innerErr),
        );
      }
    }
  }

  private parsePayload(job: ClaimedJob): Record<string, unknown> {
    if (!job.payload) return {};
    try {
      const parsed: unknown = JSON.parse(job.payload);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /**
   * ثبتِ موفقیت در زمینهٔ اجاره. اگر UPDATE صفر ردیف بخورد یعنی دامنهٔ اجارهٔ مشتق‌شده با
   * ردیفِ واقعی نمی‌خواند ⇒ «موفق» برنگردان، خطا بده تا شغل retry/مرده شود (هرگز موفقِ بی‌صدا).
   */
  private async settleSuccess(job: ClaimedJob): Promise<void> {
    const { rowCount } = await this.pool.query(
      job.kind === 'moadian'
        ? `update moadian_submission
              set status = 'sent', sent_at = now(), last_error = null, next_retry_at = null
            where id = $1`
        : `update psp_transaction
              set status = 'success', last_error = null, next_retry_at = null
            where id = $1`,
      [job.job_id],
    );
    if ((rowCount ?? 0) !== 1) {
      throw new Error(`tenant_scope_lost_${job.kind}`);
    }
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
