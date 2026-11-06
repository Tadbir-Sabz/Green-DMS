import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * چیزی که PortalAuthGuard روی request قرار می‌دهد (در کلیدِ جداگانهٔ `portal`، نه
 * `auth` کارکنان). customerId تنها منبعِ اسکوپِ دادهٔ پورتال است — هر endpoint فقط
 * دادهٔ همان مشتری را می‌خواند و هرگز از کلاینت پذیرفته نمی‌شود.
 */
export interface PortalContext {
  portalUserId: string;
  sessionId: string;
  /** شرکتِ مشتری — برای جداسازی اجاره در کوئری‌ها */
  companyId: string;
  /** مشتریِ وابسته به این حسابِ پورتال — اسکوپِ همهٔ داده‌ها */
  customerId: string;
  email: string;
}

/** خواندن نشستِ پورتال در کنترلر: @PortalUser('customerId') یا @PortalUser() */
export const PortalUser = createParamDecorator(
  (
    data: keyof PortalContext | undefined,
    ctx: ExecutionContext,
  ): PortalContext | string | undefined => {
    const portal = ctx.switchToHttp().getRequest<{ portal?: PortalContext }>().portal;
    if (!portal) return undefined;
    return data ? portal[data] : portal;
  },
);
