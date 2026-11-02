import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verify, type JwtPayload } from 'jsonwebtoken';
import { getAuthConfig } from './auth.config';
import type { AuthContext } from './auth-context.decorator';
import type { AuthRepository } from './auth.repository';
import { AUTH_REPOSITORY } from './tokens';

/** حداقل شکل request مورد نیاز گاردها (بدون وابستگی به types پرکاربرد express) */
export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
}

interface AccessPayload extends JwtPayload {
  sub: string;
  sid: string;
  cid: string;
  usr: string;
  typ: 'access';
}

const unauthorized = (code: string, message_fa: string): HttpException =>
  new UnauthorizedException({ code, message_fa });

/**
 * گارد احراز هویت: توکن Bearer را راستی‌آزمایی و نشست را زنده نگه می‌دارد.
 * برخلاف خودِ JWT، وضعیت نشست/کاربر هر بار از دیتابیس خوانده می‌شود تا
 * logout، غیرفعال‌سازی و قفل حساب بلافاصله اثر کند.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_REPOSITORY) private readonly repo: AuthRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const header = req.headers['authorization'];
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      throw unauthorized('unauthorized', 'ابتدا وارد شوید؛ توکن دسترسی ارسال نشده است.');
    }

    const cfg = getAuthConfig();
    let payload: AccessPayload;
    try {
      payload = verify(token, cfg.secret, { algorithms: ['HS256'] }) as AccessPayload;
    } catch {
      throw unauthorized('unauthorized', 'توکن دسترسی نامعتبر یا منقضی است؛ دوباره وارد شوید.');
    }
    if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
      throw unauthorized('unauthorized', 'توکن دسترسی نامعتبر است؛ دوباره وارد شوید.');
    }

    const session = await this.repo.findSessionById(payload.sid);
    if (
      !session ||
      session.revoked_at ||
      session.app_user_id !== payload.sub ||
      new Date(session.expires_at) <= new Date()
    ) {
      throw unauthorized('session_revoked', 'نشست باطل یا منقضی شده است؛ دوباره وارد شوید.');
    }
    if (!session.is_active || !session.person_active) {
      throw unauthorized('account_disabled', 'حساب کاربری غیرفعال شده است؛ با مدیر سیستم تماس بگیرید.');
    }
    const lockedUntil = session.locked_until ? new Date(session.locked_until) : null;
    if (session.is_locked || (lockedUntil && lockedUntil > new Date())) {
      // Nest استثنای 423 ندارد؛ با همان قرارداد Error (کد + پیام فارسی) صادر می‌شود
      throw new HttpException(
        {
          code: 'account_locked',
          message_fa: 'حساب کاربری قفل شده است؛ برای ادامه با مدیر سیستم تماس بگیرید.',
        },
        HttpStatus.LOCKED,
      );
    }

    const summary = await this.repo.getRolesAndPermissions(payload.sub);
    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
      companyId: session.company_id,
      username: payload.usr ?? '',
      roles: summary.roles.map((r) => r.code),
      permissions: summary.permissions,
    };
    return true;
  }
}
