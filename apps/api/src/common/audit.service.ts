import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../database/database.module';
import { type Runner, runner } from './transaction';

/** عملیات ممیزیشده — هم راستا با ستون action در audit_log (مهاجرت 0002) */
export type AuditAction =
  | 'create'
  | 'update'
  | 'void'
  | 'approve'
  | 'reject'
  | 'login'
  | 'logout'
  | 'export'
  | 'delete'
  | 'convert'
  | 'submit'
  | 'receive';

export interface AuditEntry {
  companyId?: string | null;
  actorUserId?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  /** صرفاً تشخیصی؛ هرگز مبنای تطبیق/مالکیت عملیات نیست (TASK-PM-01D-M4-F). */
  requestId?: string | null;
  /**
   * شناسهٔ عملیات M4 که سرور در همان تراکنش تولید/تأیید کرده است. فقط سرویس M4
   * آن را ست میکند؛ هیچ payload/هدر کلاینتی نمیتواند آن را بسازد. NULL برای
   * همهٔ مسیرهای تاریخی باقی میماند.
   */
  bulkOperationId?: string | null;
}

/** شکست عملیاتی پارتیشن ممیزی: تراکنش M4 باید fail-closed برگردد، نه DDL کند. */
export class AuditPartitionMissingError extends Error {
  readonly code = 'audit_partition_missing' as const;

  constructor() {
    super(
      [
        'پارتیشن ماهانهٔ audit_log وجود ندارد؛ هیچ تغییری ثبت نشد.',
        'اقدام اپراتور: با نقش مهاجرت/تعمیرات (DATABASE_URL، نه dms_app) دستور',
        '  select fn_ensure_partitions(2);',
        'را اجرا و لاگ استقرار را ثبت کنید؛ سپس عملیات را از نو آغاز کنید.',
        'نقش dms_app اجازهٔ CREATE/DDL ندارد و برنامه هرگز پارتیشن نساخته است.',
      ].join('\n'),
    );
    this.name = 'AuditPartitionMissingError';
  }
}

/**
 * نوشتن در audit_log (مهاجرت 0002، پارتیشنشده بر اساس at).
 *
 * - پارتیشنها فقط توسط مهاجرت 0019/0042 و تعمیرات ممتاز (fn_ensure_partitions)
 *   ساخته میشوند. پیش از F، recordRequired هنگام کمبود پارتیشن همان تابع DDL را
 *   زیر dms_app صدا میزد؛ چون dms_app فاقد CREATE است، آن تلاش شکست میخورد و
 *   خطای مبهمی میداد. اکنون خطا صریح، عملیاتی و fail-closed است و تراکنش M4
 *   (محصول + ممیزی + دفتر عملیات) کامل rollback میشود.
 * - `record` خطای ممیزی را بلعیده و فقط لاگ میکند؛ رفتار تاریخی سایر مسیرها حفظ
 *   شده است.
 * - `recordRequired` همان SQL را میگیرد ولی خطا را پرتاب میکند. مسیر M4 از این
 *   نسخه استفاده میکند تا «تغییر محصول بدون ممیزی» هرگز commit نشود.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** نسخهٔ سختگیرانه: شکست ممیزی ⇒ شکست تراکنش/framing operation. */
  async recordRequired(entry: AuditEntry, client?: Runner): Promise<void> {
    const q = runner(this.pool, client);
    const sql = `insert into audit_log
        (company_id, actor_user_id, action, entity_type, entity_id,
         before_data, after_data, ip, user_agent, request_id, bulk_operation_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
    const params = [
      entry.companyId ?? null,
      entry.actorUserId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      entry.ip ?? null,
      entry.userAgent ?? null,
      entry.requestId ?? null,
      entry.bulkOperationId ?? null,
    ];
    try {
      await q.query<QueryResultRow>(sql, params);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('no partition of relation')) {
        throw new AuditPartitionMissingError();
      }
      throw err;
    }
  }

  /** رفتار تاریخی: ممیزی هرگز عملیات اصلی را rollback نمیکند. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.recordRequired(entry);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      // فقط پیام خطا لاگ میشود؛ هرگز محتوای before/after ردیفها چاپ نمیشود.
      console.error('audit_write_failed', msg);
    }
  }
}

export const AUDIT_SERVICE = 'AUDIT_SERVICE';
