import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/** دلیل ابطال نشست — با check جدول auth_session (مهاجرت 0023) یکی است */
export type RevokeReason = 'logout' | 'rotated' | 'reuse_detected' | 'admin' | 'password_reset';

/** ردیف کاربر به‌همراه شرکتِ شخصِ وابسته */
export interface AuthUserRow extends QueryResultRow {
  id: string;
  username: string;
  password_hash: string | null;
  access_level: string;
  is_active: boolean;
  is_locked: boolean;
  locked_until: string | null;
  failed_attempts: number;
  last_login_at: string | null;
  created_at: string;
  company_id: string;
  person_active: boolean;
  staff_id: string | null;
}

/** ردیف نشست به‌همراه وضعیت کاربر/شخص (برای اعتبارسنجی هر دو توکن) */
export interface SessionRow extends QueryResultRow {
  id: string;
  app_user_id: string;
  device_id: string | null;
  ip: string | null;
  user_agent: string | null;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  is_active: boolean;
  is_locked: boolean;
  locked_until: string | null;
  person_active: boolean;
  company_id: string;
}

export interface RolePermissionSummary {
  roles: { id: string; code: string }[];
  permissions: string[];
}

/** ردیف کد یک‌بارمصرف (auth_otp — مهاجرت 0024) */
export interface OtpRow extends QueryResultRow {
  id: string;
  code_hash: string;
  sent_at: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
}

/** داده ثبت کد تازه */
export interface InsertOtpInput {
  username: string;
  phone: string;
  purpose: string;
  codeHash: string;
  ttlSeconds: number;
}

const USER_COLUMNS = `
  u.id, u.username, u.password_hash, u.access_level, u.is_active, u.is_locked,
  u.locked_until, u.failed_attempts, u.last_login_at, u.created_at,
  p.company_id, p.is_active as person_active, s.id as staff_id`;

const USER_FROM = `
  from app_user u
  join person p on p.id = u.person_id
  left join staff s on s.person_id = p.id`;

const SESSION_COLUMNS = `
  se.id, se.app_user_id, se.device_id, se.ip, se.user_agent,
  se.expires_at, se.revoked_at, se.revoked_reason,
  u.is_active, u.is_locked, u.locked_until,
  p.is_active as person_active, p.company_id`;

const SESSION_FROM = `
  from auth_session se
  join app_user u on u.id = se.app_user_id
  join person p on p.id = u.person_id`;

/**
 * دسترسی داده احراز هویت — SQL خام روی جداول app_user/auth_session/role (بدون ORM، §۳.۲).
 * همه پارامترها bind می‌شوند؛ نام ستون از بیرون نمی‌آید.
 */
@Injectable()
export class AuthRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `select ${USER_COLUMNS} ${USER_FROM} where u.username = $1`,
      [username],
    );
    return rows[0] ?? null;
  }

  async findUserById(id: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `select ${USER_COLUMNS} ${USER_FROM} where u.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  // ---------------- کد یک‌بارمصرف (auth_otp — 0024) ----------------

  /** شماره موبایل اصلی کاربر؛ null یعنی نه کاربر است نه شماره‌ای ثبت دارد */
  async findPrimaryPhone(username: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ phone: string }>(
      `select pp.phone
         from app_user u
         join person p on p.id = u.person_id
         join person_phone pp on pp.person_id = p.id
        where u.username = $1 and p.is_active
        order by pp.is_primary desc, pp.id
        limit 1`,
      [username],
    );
    return rows[0]?.phone ?? null;
  }

  /** آخرین زمان ارسال برای همین کاربر/دلیل (فاصله حداقلی بین دو ارسال) */
  async findLastSentAt(username: string, purpose: string): Promise<Date | null> {
    const { rows } = await this.pool.query<{ sent_at: Date }>(
      `select max(sent_at) as sent_at from auth_otp
        where username = $1 and purpose = $2`,
      [username, purpose],
    );
    return rows[0]?.sent_at ?? null;
  }

  /** تعداد درخواست‌های همین کاربر/دلیل پس از زمان داده‌شده (نرخ‌گیری پنجره‌ای) */
  async countSince(username: string, purpose: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from auth_otp
        where username = $1 and purpose = $2 and sent_at > $3`,
      [username, purpose, since],
    );
    return Number(rows[0].count);
  }

  /** ثبت کد تازه + پاک‌سازی کدهای کهنه‌تر از یک هفته (نگهداری ممیزی کوتاه) */
  async insertOtp(input: InsertOtpInput): Promise<void> {
    await this.pool.query(
      `insert into auth_otp (username, phone, purpose, code_hash, expires_at)
       values ($1, $2, $3, $4, now() + ($5::integer * interval '1 second'))`,
      [input.username, input.phone, input.purpose, input.codeHash, input.ttlSeconds],
    );
    await this.pool.query(
      `delete from auth_otp where sent_at < now() - interval '7 days'`,
    );
  }

  /** آخرین کد در انتظار همین کاربر (بدون توجه به purpose — قرارداد verify فیلد purpose ندارد) */
  async findPendingOtp(username: string): Promise<OtpRow | null> {
    const { rows } = await this.pool.query<OtpRow>(
      `select id, code_hash, sent_at, expires_at, attempts, consumed_at, purpose
         from auth_otp
        where username = $1 and consumed_at is null
        order by sent_at desc
        limit 1`,
      [username],
    );
    return rows[0] ?? null;
  }

  /** شمارش تلاش ناموفق تأیید؛ مقدار برگشتی برای تصمیم سقف تلاش استفاده می‌شود */
  async addOtpAttempt(id: string): Promise<number> {
    const { rows } = await this.pool.query<{ attempts: number }>(
      `update auth_otp set attempts = attempts + 1 where id = $1 returning attempts`,
      [id],
    );
    return rows[0]?.attempts ?? 0;
  }

  /**
   * تغییر رمز عبور (بازیابی با OTP) — شمارنده تلاش‌ها و قفل زمانی هم پاک می‌شود
   * تا کاربری که رمزش را فراموش کرده بود از بنبستِ قفل دربیاید (must_change_password
   * هم false می‌شود چون همین حالا رمز تازه گذاشته است).
   */
  async setPassword(userId: string, passwordHash: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update app_user
          set password_hash = $2,
              failed_attempts = 0,
              locked_until = null,
              must_change_password = false
        where id = $1`,
      [userId, passwordHash],
    );
    return (rowCount ?? 0) > 0;
  }

  /** مصرف اتمیک: فقط اولین تأیید موفق برنده است (رقابت هم‌زمان → false) */
  async consumeOtp(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update auth_otp set consumed_at = now()
        where id = $1 and consumed_at is null`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------------- نشست‌ها (auth_session) ----------------

  async createSession(input: {
    appUserId: string;
    refreshTokenHash: string;
    deviceId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    expiresAt: Date;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into auth_session (app_user_id, refresh_token_hash, device_id, ip, user_agent, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.appUserId,
        input.refreshTokenHash,
        input.deviceId ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
        input.expiresAt,
      ],
    );
    return rows[0].id;
  }

  async findSessionById(id: string): Promise<SessionRow | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `select ${SESSION_COLUMNS} ${SESSION_FROM} where se.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findSessionByRefreshHash(hash: string): Promise<SessionRow | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `select ${SESSION_COLUMNS} ${SESSION_FROM} where se.refresh_token_hash = $1`,
      [hash],
    );
    return rows[0] ?? null;
  }

  /** ابطال نشست؛ اگر از قبل باطل شده باشد کاری نمی‌کند (idempotent) */
  async revokeSession(id: string, reason: RevokeReason): Promise<void> {
    await this.pool.query(
      `update auth_session set revoked_at = now(), revoked_reason = $2
        where id = $1 and revoked_at is null`,
      [id, reason],
    );
  }

  /**
   * ابطال همه نشست‌های فعال یک دستگاه (DELETE /devices/{id} — ابطال از راه دور).
   * دلیل device_revoked در مهاجرت 0025 به قید ستون اضافه شده تا از logout/rotated
   * در گزارش ورود قابل تفکیک باشد.
   */
  async revokeSessionsForDevice(deviceId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `update auth_session
          set revoked_at = now(), revoked_reason = 'device_revoked'
        where device_id = $1 and revoked_at is null`,
      [deviceId],
    );
    return rowCount ?? 0;
  }

  /** چرخش: نشست قدیمی را به نشست تازه زنجیر می‌کند و می‌بندد */
  async rotateSession(oldId: string, newId: string): Promise<void> {
    await this.pool.query(
      `update auth_session
          set revoked_at = now(), revoked_reason = 'rotated', rotated_to = $2
        where id = $1 and revoked_at is null`,
      [oldId, newId],
    );
  }

  /** ابطال همه نشست‌های فعال کاربر (سوءاستفاده احتمالی از refresh یا ابطال توسط مدیر) */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const { rowCount } = await this.pool.query(
      `update auth_session
          set revoked_at = now(), revoked_reason = $2
        where app_user_id = $1
          and revoked_at is null
          and id <> coalesce($3, '00000000-0000-0000-0000-000000000000'::uuid)`,
      [userId, reason, exceptSessionId ?? null],
    );
    return rowCount ?? 0;
  }

  // ---------------- چرخه ورود ----------------

  async markLoginSuccess(userId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ last_login_at: string | null }>(
      `update app_user
          set failed_attempts = 0, locked_until = null, last_login_at = now()
        where id = $1
        returning last_login_at`,
      [userId],
    );
    return rows[0]?.last_login_at ?? null;
  }

  /**
   * ثبت تلاش ناموفق؛ با رسیدن به آستانه، قفل زمان‌دار (locked_until) می‌شود.
   * ستون‌ها با تریگر trg_touch (0020) به‌روزرسانی می‌شوند.
   */
  async recordLoginFailure(
    userId: string,
    lockThreshold: number,
    lockMinutes: number,
  ): Promise<{ failedAttempts: number; lockedUntil: string | null }> {
    const { rows } = await this.pool.query<{ failed_attempts: number; locked_until: string | null }>(
      `update app_user
          set failed_attempts = failed_attempts + 1,
              locked_until = case when failed_attempts + 1 >= $2
                                  then now() + ($3::integer * interval '1 minute')
                                  else locked_until end
        where id = $1
        returning failed_attempts, locked_until`,
      [userId, lockThreshold, lockMinutes],
    );
    return { failedAttempts: rows[0].failed_attempts, lockedUntil: rows[0].locked_until };
  }

  /** نقش‌های کاربر و مجوزهای ناشی از آن‌ها (نگاشت الگویی در SQL حل نشده — الگوها در سرویس تطبیق می‌یابند) */
  async getRolesAndPermissions(userId: string): Promise<RolePermissionSummary> {
    const { rows } = await this.pool.query<{
      role_id: string;
      role_code: string;
      permission_code: string | null;
    }>(
      `select r.id as role_id, r.code as role_code, rp.permission_code
         from user_role ur
         join role r on r.id = ur.role_id
         left join role_permission rp on rp.role_id = r.id
        where ur.app_user_id = $1
        order by r.code`,
      [userId],
    );
    const roles = new Map<string, string>();
    const permissions = new Set<string>();
    for (const row of rows) {
      roles.set(row.role_id, row.role_code);
      if (row.permission_code) permissions.add(row.permission_code);
    }
    return {
      roles: [...roles].map(([id, code]) => ({ id, code })),
      permissions: [...permissions],
    };
  }
}
