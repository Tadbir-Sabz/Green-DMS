/**
 * قرارداد مشترک کلاینت‌ها — وب (Next.js) و سه اپ اندرویدی از همین انواع
 * استفاده می‌کنند (سند §۳.۱: API اول / Contract-first).
 * منبع مفهومی: dms-design-report.md › ضمیمه F (قرارداد API).
 */
/** ماژول‌های هسته‌ای سرور — معادل Core Modules در §۳.۳ سند */
export const CORE_MODULES = [
    'identity-rbac',
    'master-data',
    'inventory',
    'rules-engine',
    'sales',
    'tours',
    'tracking',
    'finance',
    'integrations',
];
export * from './persian-date';
