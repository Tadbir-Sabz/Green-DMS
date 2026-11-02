import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

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
 * تاکنون هیچ‌جا نوشته نمی‌شد؛ این سرویس نقطهٔ واحد ثبت رویدادهای ممیزی است.
 *
 * نکات:
 * - پارتیشن‌ها با fn_ensure_partitions ساخته می‌شوند (مهاجرت 0019 در bootstrap
 *   اجرا شده)؛ اگر درج به پارتیشن نبود خورد، یک‌بار ensure را صدا می‌زنیم و
 *   دوباره تلاش می‌کنیم تا ممیزی هرگز جریان کسب‌وکار را نشکند.
 * - خطای ممیزی بلعیده می‌شود (فقط لاگ) — ممیزی نباید عملیات اصلی را rollback کند.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(entry: AuditEntry): Promise<void> {
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
      await this.pool.query(sql, params);
    } catch (err) {
      // 23514 = check_violation؛ نبودِ پارتیشن به‌صورت «no partition of relation ... found»
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('partition')) {
        try {
          await this.pool.query('select fn_ensure_partitions(2)');
          await this.pool.query(sql, params);
          return;
        } catch {
          /* در ادامه بلعیده می‌شود */
        }
      }
      // ممیزی هرگز نباید عملیات اصلی را بیندازد
      console.error('audit_write_failed', msg);
    }
  }
}

export const AUDIT_SERVICE = 'AUDIT_SERVICE';
