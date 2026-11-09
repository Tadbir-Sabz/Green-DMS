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
import { getAuthConfig } from '../identity-rbac/auth.config';
import type { PortalContext } from './portal-context.decorator';
import type { PortalRepository } from './portal.repository';
import { PORTAL_REPOSITORY } from './tokens';

interface PortalAccessPayload extends JwtPayload {
  sub: string; // portal_user_id
  sid: string; // portal_session_id
  cid: string; // company_id
  cust: string; // customer_id
  em: string; // email
  typ: 'portal_access';
}

const unauthorized = (code: string, message_fa: string): HttpException =>
  new UnauthorizedException({ code, message_fa });

/**
 * گارد احرازِ هویتِ پورتال. دو لایه جداسازی از API کارکنان:
 *  ۱) verify با audience:'portal' → توکنِ کارکنان (بدونِ این audience) همین‌جا رد می‌شود.
 *  ۲) بررسی typ==='portal_access' → حتی اگر audience نادیده گرفته شود، نوع توکن فرق دارد.
 * مانند گارد کارکنان، وضعیت نشست/حساب هر بار از DB خوانده می‌شود تا logout،
 * غیرفعال‌سازی و قفلِ حساب بلافاصله اثر کند.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(@Inject(PORTAL_REPOSITORY) private readonly repo: PortalRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<{
        headers: Record<string, string | string[] | undefined>;
        portal?: PortalContext;
      }>();
    const header = req.headers['authorization'];
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      throw unauthorized('unauthorized', 'ابتدا وارد پورتال شوید؛ توکن دسترسی ارسال نشده است.');
    }

    const cfg = getAuthConfig();
    let payload: PortalAccessPayload;
    try {
      payload = verify(token, cfg.secret, {
        algorithms: ['HS256'],
        audience: 'portal',
      }) as PortalAccessPayload;
    } catch {
      throw unauthorized('unauthorized', 'توکن پورتال نامعتبر یا منقضی است؛ دوباره وارد شوید.');
    }
    if (payload.typ !== 'portal_access' || !payload.sub || !payload.sid || !payload.cust || !payload.cid) {
      throw unauthorized('unauthorized', 'توکن پورتال نامعتبر است؛ دوباره وارد شوید.');
    }

    const session = await this.repo.findSessionById(payload.sid, payload.cid);
    if (
      !session ||
      session.revoked_at ||
      session.portal_user_id !== payload.sub ||
      session.company_id !== payload.cid || session.customer_id !== payload.cust ||
      new Date(session.expires_at) <= new Date()
    ) {
      throw unauthorized('session_revoked', 'نشست پورتال باطل یا منقضی شده است؛ دوباره وارد شوید.');
    }
    if (!session.is_active) {
      throw unauthorized('account_disabled', 'حساب پورتال غیرفعال شده است.');
    }
    const lockedUntil = session.locked_until ? new Date(session.locked_until) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      throw new HttpException(
        {
          code: 'account_locked',
          message_fa: 'حساب پورتال موقتاً قفل است؛ کمی بعد دوباره تلاش کنید.',
        },
        HttpStatus.LOCKED,
      );
    }

    req.portal = {
      portalUserId: payload.sub,
      sessionId: payload.sid,
      companyId: session.company_id,
      customerId: session.customer_id,
      email: payload.em ?? '',
    };
    return true;
  }
}
