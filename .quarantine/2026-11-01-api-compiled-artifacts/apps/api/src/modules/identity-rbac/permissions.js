"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAnyPermission = exports.permissionMatches = void 0;
/**
 * تطبیق الگوی اعطای مجوز با مجوزِ لازم — همان منطق SQL در
 * migrations/0022_seed_reference_data.up.sql (الگوی نقش ← مجوز):
 *   '*'                همه مجوزها
 *   'sales.*'          همه زیرمجموعه‌های sales (sales.order.create و …)
 *   'sales.order'      دقیقاً همان مجوز + زیرمجموعه‌هایش (sales.order.create)
 *   'sales.order.create' دقیقاً همان مجوز
 */
const permissionMatches = (granted, required) => {
    if (granted === '*')
        return true;
    if (granted === required)
        return true;
    const prefix = granted.endsWith('.*') ? granted.slice(0, -1) : `${granted}.`;
    return required.startsWith(prefix);
};
exports.permissionMatches = permissionMatches;
/** آیا کاربری با این مجموعه مجوز، حداقل یکی از مجوزهای خواسته‌شده را دارد؟ */
const hasAnyPermission = (granted, required) => required.some((need) => granted.some((g) => (0, exports.permissionMatches)(g, need)));
exports.hasAnyPermission = hasAnyPermission;
