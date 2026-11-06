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





/**
 * دسترسی دادهٔ احراز هویت — SQL خام (بدون ORM، §۳.۲)؛ همهٔ پارامترها bind می‌شوند و نامِ ستون
 * از بیرون نمی‌آید.
 *
 * از مهاجرتِ 0043 هر دسترسیِ «پیش‌اجاره» (پیش از ست شدنِ app.company_id) از راهِ توابعِ
 * SECURITY DEFINERِ همان مهاجرت انجام می‌شود، نه select/update مستقیم رویِ
 * app_user/auth_session/user_role/role_permission. دلیلش اجرایی است نه تزئینی: این پنج جدول
 * اکنون RLS دارند و والدشان (person/role) هم از 0041 RLS دارد، پس کوئریِ مستقیم زیرِ نقشِ
 * زمانِ اجرا (dms_app) صفر ردیف می‌داد و ورودِ کارمند کار نمی‌کرد. توابع پارامترِ company_id
 * ندارند (پس انتخابِ دلخواهِ اجاره ممکن نیست)، کمینهٔ ستون‌ها را برمی‌گردانند، search_path
 * پین‌شده دارند و EXECUTE‌شان فقط به dms_app داده شده است. دسترسیِ «پس‌اجاره» (مدیریتِ
 * کاربران در users.repository) مستقیم و زیرِ همان RLS باقی مانده است.
 */
@Injectable()
export class AuthRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      // پنجرهٔ پیش‌اجاره: این پرس‌وجو پیش از ست شدنِ app.company_id اجرا می‌شود و به
      // person/staff می‌رسد که از 0041 زیرِ RLS هستند ⇒ زیرِ نقشِ زمانِ اجرا (dms_app)
      //直 select صفر ردیف می‌داد. تابعِ SECURITY DEFINERِ مهاجرتِ 0043 همان ستون‌ها را با
      // پارامترِ الزامی و بدونِ company_id برمی‌گرداند (انتخابِ اجاره از بیرون ممکن نیست).
      `select * from fn_auth_find_user($1, null)`,
      [username],
    );
    return rows[0] ?? null;
  }

  async findUserById(id: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `select * from fn_auth_find_user(null, $1)`,
      [id],
    );
    return rows[0] ?? null;
  }

  // ---------------- کد یک‌بارمصرف (auth_otp — 0024) ----------------

  /** شماره موبایل اصلی کاربر؛ null یعنی نه کاربر است نه شماره‌ای ثبت دارد */
  async findPrimaryPhone(username: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ phone: string }>(
      `select fn_auth_find_primary_phone($1) as phone`,
      [username],
    );
    return rows[0]?.phone ?? null;
  }

  /** آخرین زمان ارسال برای همین کاربر/دلیل (فاصله حداقلی بین دو ارسال) */
  async findLastSentAt(username: string, purpose: string): Promise<Date | null> {
    const { rows } = await this.pool.query<{ sent_at: Date }>(
      // پنجرهٔ پیش‌اجارهٔ OTP از مهاجرتِ 0045 فقط از راهِ تابعِ SECURITY DEFINER باز می‌شود:
      // auth_otp سیاستِ «ردِ کاملِ دسترسیِ مستقیم» دارد (code_hash و phoneِ کاربرانِ همهٔ
      // اجاره‌ها در آن است)، پس select مستقیم زیرِ نقشِ زمانِ اجرا صفر ردیف می‌داد.
      `select last_sent_at as sent_at from fn_otp_rate($1, $2, null)`,
      [username, purpose],
    );
    return rows[0]?.sent_at ?? null;
  }

  /** تعداد درخواست‌های همین کاربر/دلیل پس از زمان داده‌شده (نرخ‌گیری پنجره‌ای) */
  async countSince(username: string, purpose: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `select count_since::text as count from fn_otp_rate($1, $2, $3)`,
      [username, purpose, since],
    );
    return Number(rows[0].count);
  }

  /** ثبت کد تازه + پاک‌سازی کدهای کهنه‌تر از یک هفته (نگهداری ممیزی کوتاه) */
  async insertOtp(input: InsertOtpInput): Promise<void> {
    await this.pool.query(
      `select fn_otp_issue($1, $2, $3, $4, $5)`,
      [input.username, input.phone, input.purpose, input.codeHash, input.ttlSeconds],
    );
  }

  /** آخرین کد در انتظار همین کاربر (بدون توجه به purpose — قرارداد verify فیلد purpose ندارد) */
  async findPendingOtp(username: string): Promise<OtpRow | null> {
    const { rows } = await this.pool.query<OtpRow>(
      `select * from fn_otp_find_pending($1)`,
      [username],
    );
    return rows[0] ?? null;
  }

  /** شمارش تلاش ناموفق تأیید؛ مقدار برگشتی برای تصمیم سقف تلاش استفاده می‌شود */
  async addOtpAttempt(id: string): Promise<number> {
    const { rows } = await this.pool.query<{ attempts: number | string }>(
      `select fn_otp_attempt($1) as attempts`,
      [id],
    );
    return Number(rows[0]?.attempts ?? 0);
  }

  /**
   * تغییر رمز عبور (بازیابی با OTP) — شمارنده تلاش‌ها و قفل زمانی هم پاک می‌شود
   * تا کاربری که رمزش را فراموش کرده بود از بنبستِ قفل دربیاید (must_change_password
   * هم false می‌شود چون همین حالا رمز تازه گذاشته است).
   */
  async setPassword(userId: string, passwordHash: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      `select fn_auth_set_password($1, $2) as ok`,
      [userId, passwordHash],
    );
    return rows[0]?.ok === true;
  }

  /** مصرف اتمیک: فقط اولین تأیید موفق برنده است (رقابت هم‌زمان → false) */
  async consumeOtp(id: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ consumed: boolean }>(
      `select fn_otp_consume($1) as consumed`,
      [id],
    );
    return rows[0]?.consumed === true;
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
      `select fn_auth_create_session($1, $2, $3, $4, $5, $6) as id`,
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
      `select * from fn_auth_find_session($1, null)`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findSessionByRefreshHash(hash: string): Promise<SessionRow | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `select * from fn_auth_find_session(null, $1)`,
      [hash],
    );
    return rows[0] ?? null;
  }

  /** ابطال نشست؛ اگر از قبل باطل شده باشد کاری نمی‌کند (idempotent) */
  async revokeSession(id: string, reason: RevokeReason): Promise<void> {
    await this.pool.query(
      `select fn_auth_revoke_session($1, $2)`,
      [id, reason],
    );
  }

  /**
   * ابطال همه نشست‌های فعال یک دستگاه (DELETE /devices/{id} — ابطال از راه دور).
   * دلیل device_revoked در مهاجرت 0025 به قید ستون اضافه شده تا از logout/rotated
   * در گزارش ورود قابل تفکیک باشد.
   */
  async revokeSessionsForDevice(deviceId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select fn_auth_revoke_device($1, 'device_revoked') as n`,
      [deviceId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** چرخش: نشست قدیمی را به نشست تازه زنجیر می‌کند و می‌بندد */
  async rotateSession(oldId: string, newId: string): Promise<void> {
    await this.pool.query(
      `select fn_auth_rotate_session($1, $2)`,
      [oldId, newId],
    );
  }

  /** ابطال همه نشست‌های فعال کاربر (سوءاستفاده احتمالی از refresh یا ابطال توسط مدیر) */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select fn_auth_revoke_user_sessions($1, $2, $3) as n`,
      [userId, reason, exceptSessionId ?? null],
    );
    return Number(rows[0]?.n ?? 0);
  }

  // ---------------- چرخه ورود ----------------

  async markLoginSuccess(userId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ last_login_at: string | null }>(
      `select fn_auth_login_success($1) as last_login_at`,
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
      `select * from fn_auth_login_failure($1, $2, $3)`,
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
      `select role_id, role_code, permission_code
         from fn_auth_roles_permissions($1)
        order by role_code`,
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
