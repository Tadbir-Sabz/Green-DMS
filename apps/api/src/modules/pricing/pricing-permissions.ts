import { ForbiddenException } from '@nestjs/common';
import { permissionMatches } from '../identity-rbac/permissions';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';
import type { OrderPricingPermissions } from './pricing-engine.service';

/**
 * TASK-24W · منبعِ واحدِ مجوزهای قیمت‌گذاری.
 *
 * پیش از این، هر کنترلر مجموعهٔ مجوزها را جدا می‌ساخت (`order.controller.ts` و
 * `pricing-quote.controller.ts`). با افزودنِ مسیرِ تبدیلِ درخواست به سفارش
 * (`POST /requests/{id}/convert`) سه پیاده‌سازیِ موازی خطرِ واگرایی داشت؛ این فایل
 * تنها جای ساختِ `OrderPricingPermissions` از نشست است.
 *
 * قواعدِ صریح:
 *   • تنها ورودی، `AuthContext` است که `AuthGuard` از نشست/توکنِ معتبر ساخته است.
 *   • هیچ فیلدِ بدنهٔ درخواست (مثل `permissions`, `manual_price`, `allow_*`) خوانده
 *     نمی‌شود؛ بنابراین «پرچمِ جعلیِ کلاینت» اثرِ صفر دارد.
 *   • اگر زمینهٔ احراز هویت ناقص باشد (کاربر/شرکت/مجوزها)، fail-closed عمل می‌کنیم.
 */

/** مجوزهای لازم برای هر قابلیتِ قیمت — یک‌جا و قابلِ حسابرسی */
export const PRICING_PERMISSION_CODES = {
  manual_price: 'pricing.manual_price.apply',
  discount_override: 'pricing.discount.override',
  cross_domain_price_list: 'pricing.price_list.cross_domain',
  backdate: 'pricing.backdate.apply',
} as const;

/** پیش‌فرضِ امن: هیچ قابلیتِ قیمتی مجاز نیست */
export const DENY_ALL_PRICING_PERMISSIONS: OrderPricingPermissions = Object.freeze({
  manual_price: false,
  discount_override: false,
  cross_domain_price_list: false,
  backdate: false,
});

/** خطای صریح برای وقتی زمینهٔ مجوز قابلِ اعتماد نیست */
export const pricingContextUnavailable = (): ForbiddenException =>
  new ForbiddenException({
    code: 'authorization_context_missing',
    message_fa:
      'زمینهٔ احراز هویت/مجوز برای این عملیات در دسترس نیست؛ عملیات به‌صورتِ امن (fail-closed) رد شد.',
  });

/**
 * آیا زمینهٔ نشست برای تصمیمِ قیمتی قابلِ اتکاست؟
 * حداقل: شناسهٔ کاربر، شناسهٔ شرکت و فهرستِ مجوزها (که می‌تواند خالی باشد).
 */
export const isTrustedAuthContext = (user: AuthContext | null | undefined): boolean =>
  Boolean(
    user &&
      typeof user.userId === 'string' &&
      user.userId.length > 0 &&
      typeof user.companyId === 'string' &&
      user.companyId.length > 0 &&
      Array.isArray(user.permissions),
  );

/**
 * ساختِ مجوزهای قیمت از نشست.
 * @throws ForbiddenException وقتی زمینهٔ نشست ناقص/غیرقابلِ اعتماد است (fail-closed)
 */
export const pricingPermissionsFromSession = (user: AuthContext | null | undefined): OrderPricingPermissions => {
  if (!isTrustedAuthContext(user)) throw pricingContextUnavailable();
  const has = (code: string): boolean => user!.permissions.some((granted) => permissionMatches(granted, code));
  return {
    manual_price: has(PRICING_PERMISSION_CODES.manual_price),
    discount_override: has(PRICING_PERMISSION_CODES.discount_override),
    cross_domain_price_list: has(PRICING_PERMISSION_CODES.cross_domain_price_list),
    backdate: has(PRICING_PERMISSION_CODES.backdate),
  };
};

/**
 * نسخهٔ بدونِ استثنا — فقط برای مسیرهایی که نبودِ نشست را جداگانه گزارش می‌کنند.
 * هنوز fail-closed است: زمینهٔ ناقص ⇒ همهٔ مجوزها false.
 */
export const pricingPermissionsOrDenyAll = (
  user: AuthContext | null | undefined,
): OrderPricingPermissions =>
  isTrustedAuthContext(user) ? pricingPermissionsFromSession(user) : { ...DENY_ALL_PRICING_PERMISSIONS };
