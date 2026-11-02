import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * مجوزهای لازم برای یک مسیر — توسط PermissionsGuard خوانده می‌شود:
 * @RequirePermissions('master.product.create')
 * نبود مجوز → 403 با قرارداد Error (کد forbidden + پیام فارسی).
 */
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
