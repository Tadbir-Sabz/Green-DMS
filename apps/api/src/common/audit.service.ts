import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../database/database.module';
import { type Runner, runner } from './transaction';

/** عملیات ممیزی‌شده — هم‌راستا با ستون action در audit_log (مهاجرت 0002) */
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
  requestId?: string | null;
}

/**
 * نوشتن در audit_log (مهاجرت 0002، پارتیشن‌شده بر اساس at).
 * تاکنون هیچجا نوشته نمیشد؛ این سرویس نقطهٔ واحد ثبت رویدادهای ممیزی است.
 *
 * نکات:
 * - پارتیشنها با fn_ensure_partitions ساخته میشوند (مهاجرت 0019 در bootstrap
 *   اجرا شده)؛ اگر درج به پارتیشن نبود خورد، یکبار ensure را صدا میزنیم و
 *   دوباره تلاش میکنیم تا ممیزی هرگز جریان کسبوکار را نشکند.
 * - `record` خطای ممیزی را بلعیده و فقط لاگ میکند؛ رفتار تاریخی برای سایر
 *   مسیرها حفظ شده است.
 * - `recordRequired` همان SQL را میگیرد ولی خطا را پرتاب میکند. مسیرهایی که
 *   ممیزی باید همتراز با commit محصول ثابت شود (M4) از این نسخه استفاده میکنند؛
 *   در غیر اینصورت بلعیدهشدن خطا میتوانست «تغییر محصول بدون ممیزی» بسازد.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** نسخهٔ سختگیرانه: شکست ممیزی ⇒ شکست تراکنش/framing operation. */
  async recordRequired(entry: AuditEntry, client?: Runner): Promise<void> {
    const q = runner(this.pool, client);
    const sql = `insert into audit_log
        (company_id, actor_user_id, action, entity_type, entity_id,
         before_data, after_data, ip, user_agent, request_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
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
    ];
    try {
      await q.query<QueryResultRow>(sql, params);
    } catch (err) {
      // 23514 / نبود پارتیشن: یکبار اطمینان از پارتیشنها و تلاش دوباره.
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('partition')) {
        await q.query<QueryResultRow>('select fn_ensure_partitions(2)', []);
        await q.query<QueryResultRow>(sql, params);
        return;
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
