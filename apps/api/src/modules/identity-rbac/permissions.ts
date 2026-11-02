/**
 * تطبیق الگوی اعطای مجوز با مجوزِ لازم — همان منطق SQL در
 * migrations/0022_seed_reference_data.up.sql (الگوی نقش ← مجوز):
 *   '*'                همه مجوزها
 *   'sales.*'          همه زیرمجموعه‌های sales (sales.order.create و …)
 *   'sales.order'      دقیقاً همان مجوز + زیرمجموعه‌هایش (sales.order.create)
 *   'sales.order.create' دقیقاً همان مجوز
 */
export const permissionMatches = (granted: string, required: string): boolean => {
  if (granted === '*') return true;
  if (granted === required) return true;
  const prefix = granted.endsWith('.*') ? granted.slice(0, -1) : `${granted}.`;
  return required.startsWith(prefix);
};

/** آیا کاربری با این مجموعه مجوز، حداقل یکی از مجوزهای خواسته‌شده را دارد؟ */
export const hasAnyPermission = (
  granted: readonly string[],
  required: readonly string[],
): boolean => required.some((need) => granted.some((g) => permissionMatches(g, need)));
