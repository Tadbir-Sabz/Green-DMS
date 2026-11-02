import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** چیزی که AuthGuard روی request قرار می‌دهد — پایه تصمیم مجوز و شرکتِ نشست */
export interface AuthContext {
  userId: string;
  sessionId: string;
  /** شرکتِ نشست — تنها منبع company_id در API؛ از کلاینت پذیرفته نمی‌شود */
  companyId: string;
  username: string;
  roles: string[];
  /** مجوزهای استخراج‌شده از نقش‌ها (الگوها هنوز باز نشده‌اند؛ permissionMatches آن‌ها را تطبیق می‌دهد) */
  permissions: string[];
}

/**
 * خواندن نشست جاری در کنترلر: @CurrentUser('companyId') یا @CurrentUser() برای کل شیء
 * (فرم تک‌فیلدی ممکن است آرایه باشد — roles/permissions)
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthContext | undefined,
    ctx: ExecutionContext,
  ): AuthContext | string | string[] | undefined => {
    const auth = ctx.switchToHttp().getRequest<{ auth?: AuthContext }>().auth;
    if (!auth) return undefined;
    return data ? auth[data] : auth;
  },
);
