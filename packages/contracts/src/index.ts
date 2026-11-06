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
] as const;

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

/**
 * TASK-19 — liveness: فقط «زنده بودنِ فرآیند»؛ هیچ وابستگی‌ای را چک نمی‌کند و
 * قطعیِ موقتِ PostgreSQL باعثِ fail شدنِ liveness نمی‌شود (پروبِ orchestration).
 */
export interface LivenessResponse {
  status: 'live';
  service: string;
  version: string;
  /** زمان پاسخ به وقت UTC */
  timestamp: string;
}

/**
 * TASK-19 — readiness: وابستگی‌هایِ لازم برایِ سرویس‌دهی (پایگاه‌داده) را راستی‌آزمایی
 * می‌کند؛ 200 یعنی آماده، 503 با status='unready' یعنی آماده نیست. وضعیتِ Redis فقط
 * گزارش می‌شود (بدونِ Redis هم سرویس با کاهشِ کارایی بالا می‌آید — redis.module.ts).
 */
export interface ReadinessResponse {
  status: 'ready' | 'unready';
  service: string;
  version: string;
  /** وضعیت اتصال پایگاه‌داده — معیارِ اصلیِ آمادگی */
  database: 'up' | 'down';
  /** وضعیت Redis — اطلاعاتی (کش/صف)، شرطِ آمادگی نیست */
  redis: 'up' | 'down';
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

export * from './persian-date.js';
