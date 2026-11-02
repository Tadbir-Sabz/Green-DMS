import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthContext } from './auth-context.decorator';
import { permissionMatches } from './permissions';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import type { RequestLike } from './auth.guard';

/**
 * گارد مجوز (RBAC): مجوزهای اعلام‌شده با @RequirePermissions روی نقش‌های نشست
 * با همان منطق الگوییِ seed 0022 تطبیق داده می‌شوند. نبود مجوز → 403 قراردادی.
 * پیش‌نیاز: AuthGuard باید اجرا شده باشد (req.auth پر شده باشد).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const required = Reflect.getMetadata(PERMISSIONS_KEY, ctx.getHandler()) as
      | string[]
      | undefined;
    if (!required || required.length === 0) return true;

    const auth = ctx.switchToHttp().getRequest<RequestLike>().auth;
    if (!auth) {
      // AuthGuard اجرا نشده — از سهوِ پیکربندی با پیام روشن جلوگیری می‌کنیم
      throw new UnauthorizedException({
        code: 'unauthorized',
        message_fa: 'ابتدا وارد شوید؛ توکن دسترسی ارسال نشده است.',
      });
    }

    const missing = required.filter(
      (need) => !auth.permissions.some((granted) => permissionMatches(granted, need)),
    );
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'forbidden',
        message_fa: `برای این عملیات مجوز «${missing.join('، ')}» لازم است.`,
        details: { required: missing, granted: auth.permissions, roles: auth.roles },
      });
    }
    return true;
  }
}
