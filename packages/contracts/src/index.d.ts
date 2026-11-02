/**
 * قرارداد مشترک کلاینت‌ها — وب (Next.js) و سه اپ اندرویدی از همین انواع
 * استفاده می‌کنند (سند §۳.۱: API اول / Contract-first).
 * منبع مفهومی: dms-design-report.md › ضمیمه F (قرارداد API).
 */
/** ماژول‌های هسته‌ای سرور — معادل Core Modules در §۳.۳ سند */
export declare const CORE_MODULES: readonly ["identity-rbac", "master-data", "inventory", "rules-engine", "sales", "tours", "tracking", "finance", "integrations"];
export type CoreModule = (typeof CORE_MODULES)[number];
/** پوشش یکسان همه پاسخ‌های API: خطای ساخت‌یافته با کد دامنه‌ای */
export interface ApiError {
    /** کد ماشینی، مثال: 'validation_failed' */
    code: string;
    /** پیام فارسی قابل نمایش به کاربر */
    message: string;
    /** جزئیات اختیاری (فیلد خاص فرم، قاعده ردشده و…) */
    details?: Record<string, unknown>;
}
/** پاسخ سالم‌سازی سرویس */
export interface HealthResponse {
    status: 'ok' | 'degraded';
    service: string;
    version: string;
    /** وضعیت اتصال پایگاه‌داده */
    database: 'up' | 'down';
    /** زمان پاسخ به وقت UTC */
    timestamp: string;
}
/** صفحه‌بندی استاندارد فهرست‌ها — cursor-based (openapi.yaml › schemas.Page) */
export interface PageQuery {
    cursor?: string;
    limit?: number;
}
export interface Page<T> {
    items: T[];
    /** مقدار cursor برای صفحه بعدی؛ null یعنی پایان */
    next_cursor: string | null;
    has_more: boolean;
}
export * from './persian-date';
