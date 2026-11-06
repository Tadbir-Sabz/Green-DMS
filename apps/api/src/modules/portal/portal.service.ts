import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { getAuthConfig } from '../identity-rbac/auth.config';
import {
  dummyPasswordHash,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../identity-rbac/password';
import { PORTAL_REPOSITORY } from './tokens';
import type { PortalRepository } from './portal.repository';
import type {
  CreatePortalUserDto,
  PortalBalance,
  PortalIdentity,
  PortalInvoice,
  PortalMe,
  PortalOrder,
  PortalSessionResponse,
} from './portal.dto';

/** متادیتای درخواست برای ثبتِ نشست (اختیاری) */
export interface PortalRequestMeta {
  userAgent: string | null;
  ip: string | null;
}

const unauthorized = (code: string, message_fa: string): HttpException =>
  new UnauthorizedException({ code, message_fa });

/** توکن refresh: ۴۸ بایت تصادفی (بدونِ قابلیت حدس‌زدن) — فقط hash آن ذخیره می‌شود */
const generateRefreshToken = (): string => randomBytes(48).toString('base64url');

interface PortalPrincipal {
  id: string;
  companyId: string;
  customerId: string;
  email: string;
  displayName: string | null;
}

/**
 * سرویس پورتال B2B. احرازِ هویت مستقل از کارکنان: رمز با scrypt (بازاستفاده از
 * password.ts)، توکن دسترسی با audience='portal' و typ='portal_access' (جداسازیِ
 * کامل از توکنِ کارکنان)، refresh چرخشی با hash و تشخیصِ استفادهٔ مجدد، و قفلِ
 * حساب پس از تلاش‌های ناموفق. دادهٔ مشتری همیشه با (companyId, customerId) اسکوپ می‌شود.
 */
@Injectable()
export class PortalService {
  constructor(@Inject(PORTAL_REPOSITORY) private readonly repo: PortalRepository) {}

  private signAccess(p: PortalPrincipal, sessionId: string): string {
    const cfg = getAuthConfig();
    const payload = {
      sub: p.id,
      sid: sessionId,
      cid: p.companyId,
      cust: p.customerId,
      em: p.email,
      typ: 'portal_access' as const,
    };
    return sign(payload, cfg.secret, {
      algorithm: 'HS256',
      expiresIn: cfg.accessTtlSeconds,
      audience: 'portal',
    });
  }

  private identity(p: PortalPrincipal): PortalIdentity {
    return {
      id: p.id,
      email: p.email,
      display_name: p.displayName,
      company_id: p.companyId,
      customer_id: p.customerId,
    };
  }

  private async issueSession(
    p: PortalPrincipal,
    meta: PortalRequestMeta,
  ): Promise<PortalSessionResponse> {
    const cfg = getAuthConfig();
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + cfg.refreshTtlSeconds * 1000);
    const sessionId = await this.repo.createSession({
      portalUserId: p.id,
      companyId: p.companyId,
      refreshHash: sha256Hex(refreshToken),
      expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return {
      access_token: this.signAccess(p, sessionId),
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: cfg.accessTtlSeconds,
      portal_user: this.identity(p),
    };
  }

  async signIn(
    email: string,
    password: string,
    meta: PortalRequestMeta,
  ): Promise<PortalSessionResponse> {
    const cfg = getAuthConfig();
    const user = await this.repo.findByEmail(email);
    if (!user) {
      // صرفِ هزینهٔ معادل برای جلوگیری از user enumeration
      await dummyPasswordHash();
      throw unauthorized('invalid_credentials', 'ایمیل یا رمز عبور نادرست است.');
    }

    const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      throw new HttpException(
        { code: 'account_locked', message_fa: 'حساب پورتال موقتاً قفل است؛ کمی بعد دوباره تلاش کنید.' },
        HttpStatus.LOCKED,
      );
    }

    const ok = user.is_active && (await verifyPassword(password, user.password_hash));
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      const shouldLock = attempts >= cfg.maxFailedAttempts;
      await this.repo.recordLoginFailure(
        user.id,
        shouldLock ? new Date(Date.now() + cfg.lockMinutes * 60_000) : null,
      );
      throw unauthorized('invalid_credentials', 'ایمیل یا رمز عبور نادرست است.');
    }

    await this.repo.recordLoginSuccess(user.id);
    return this.issueSession(
      {
        id: user.id,
        companyId: user.company_id,
        customerId: user.customer_id,
        email: user.email,
        displayName: user.display_name,
      },
      meta,
    );
  }

  async refresh(refreshToken: string, meta: PortalRequestMeta): Promise<PortalSessionResponse> {
    const row = await this.repo.findSessionByRefreshHash(sha256Hex(refreshToken));
    if (!row) throw unauthorized('invalid_refresh_token', 'نشست پورتال معتبر نیست؛ دوباره وارد شوید.');

    if (row.revoked_at) {
      // استفادهٔ مجدد از refresh باطل‌شده → نشانهٔ سرقتِ احتمالی؛ همهٔ نشست‌ها را باطل کن
      throw unauthorized('refresh_reused', 'این توکن پیش‌تر استفاده شده است؛ دوباره وارد شوید.');
    }
    if (new Date(row.expires_at) <= new Date()) {
      throw unauthorized('refresh_expired', 'نشست پورتال منقضی شده است؛ دوباره وارد شوید.');
    }
    const user = await this.repo.findById(row.portal_user_id);
    if (!user || !user.is_active) {
      throw unauthorized('invalid_refresh_token', 'نشست پورتال معتبر نیست؛ دوباره وارد شوید.');
    }

    // چرخش: باطل‌کردن نشستِ کهنه و صدور نشستِ تازه.
    // محافظتِ هم‌زمانی (replay): بررسیِ revoked_at بالای یک عملیاتِ check-then-act است؛
    // اگر دو درخواست با یک توکن هم‌زمان برسند، هر دو revoked_at=null می‌بینند. بنابراین
    // نتیجهٔ خودِ UPDATE اتمی ملاک است: rowCount=۰ یعنی توکن در این فاصله توسط درخواستِ
    // دیگری مصرف شده → بدون صدور نشستِ دوم، همان خطای استفادهٔ مجدد برمی‌گردد.
    const revoked = await this.repo.revokeSession(row.id);
    if (revoked === 0) {
      throw unauthorized('refresh_reused', 'این توکن پیش‌تر استفاده شده است؛ دوباره وارد شوید.');
    }
    return this.issueSession(
      {
        id: user.id,
        companyId: user.company_id,
        customerId: user.customer_id,
        email: user.email,
        displayName: user.display_name,
      },
      meta,
    );
  }

  async logout(sessionId: string): Promise<{ revoked: boolean }> {
    await this.repo.revokeSession(sessionId);
    return { revoked: true };
  }

  async me(companyId: string, portalUserId: string): Promise<PortalMe> {
    const me = await this.repo.me(companyId, portalUserId);
    if (!me) throw unauthorized('unauthorized', 'حساب پورتال یافت نشد.');
    return me;
  }

  invoices(companyId: string, customerId: string): Promise<PortalInvoice[]> {
    return this.repo.invoices(companyId, customerId);
  }

  orders(companyId: string, customerId: string): Promise<PortalOrder[]> {
    return this.repo.orders(companyId, customerId);
  }

  balance(companyId: string, customerId: string): Promise<PortalBalance> {
    return this.repo.balance(companyId, customerId);
  }

  /** پروکسی‌دادنِ حسابِ پورتال برای یک مشتری — توسطِ کارکنان (master.customer.update). */
  async createPortalUser(dto: CreatePortalUserDto, companyId: string): Promise<PortalIdentity> {
    const inCompany = await this.repo.customerInCompany(companyId, dto.customer_id);
    if (!inCompany) {
      throw new BadRequestException({
        code: 'customer_not_found',
        message_fa: 'مشتری در این شرکت یافت نشد.',
      });
    }
    if (await this.repo.emailExists(dto.email)) {
      throw new ConflictException({
        code: 'email_taken',
        message_fa: 'این ایمیل پیش‌تر برای پورتال ثبت شده است.',
      });
    }
    const passwordHash = await hashPassword(dto.password);
    return this.repo.createPortalUser({
      companyId,
      customerId: dto.customer_id,
      email: dto.email,
      passwordHash,
      displayName: dto.display_name ?? null,
    });
  }
}
