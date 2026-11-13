import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TenantInterceptor } from './common/tenant.interceptor';
import { CommonInfraModule } from './common/common-infra.module';
import { DocNumberModule } from './common/doc-number.module';
import { AuditModule } from './common/audit.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityRbacModule } from './modules/identity-rbac/identity-rbac.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RulesEngineModule } from './modules/rules-engine/rules-engine.module';
import { SalesModule } from './modules/sales/sales.module';
import { ToursModule } from './modules/tours/tours.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GlModule } from './modules/gl/gl.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BiModule } from './modules/bi/bi.module';
import { RoutingModule } from './modules/routing/routing.module';
import { PortalModule } from './modules/portal/portal.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { BillingModule } from './modules/billing/billing.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
// TASK-PM-02-C3: لایهٔ مشترک ضمائم سازمانی (فاکتور/سفارش/مرجوعی/انبارگردانی/
// سند حسابداری/رسید پرداخت/POD) روی همان AttachmentsModule موجود.
import { EntityAttachmentsModule } from './modules/attachments/entity-attachments.module';
// TASK-PM-02-C4: صدور/پیشنمایش ورود بستهٔ ضمائم، بدون مالک/مجوز/مهاجرت تازه.
import { AttachmentTransferModule } from './modules/attachments/attachment-transfer.module';

/**
 * ریشه اپ API — چیدمان ماژول‌ها دقیقاً Core Modules سند §۳.۳:
 * Identity & RBAC / Master Data / Inventory / Rules Engine / Sales /
 * Tours & Visits / Tracking & Routing / Finance / Integrations / Reports
 *
 * همهٔ ماژول‌ها اکنون پیاده‌سازی واقعی دارند و ثبت شده‌اند (دیگر اسکلتِ سرو‌شده
 * نداریم): BiModule (KPI/ABC/پیش‌بینی روی materialized viewهای گزارش‌دهی)،
 * RoutingModule (بهینه‌ساز مسیر TSP روی مختصاتِ PostGIS مشتریان) و PortalModule
 * (پورتال B2B مشتریان با هویتِ جداگانهٔ portal_user و JWT با audience مجزا).
 */
@Module({
  imports: [
    // زیرساخت مشترک: Throttler، Redis، صف‌های BullMQ و health سراسری (فاز B)
    CommonInfraModule,
    DatabaseModule,
    // شماره‌گذاری اسناد از document_series/number_counter (سراسری)
    DocNumberModule,
    // ممیزی رویدادها در audit_log (سراسری)
    AuditModule,
    HealthModule,
    IdentityRbacModule,
    MasterDataModule,
    PricingModule,
    InventoryModule,
    RulesEngineModule,
    SalesModule,
    ToursModule,
    TrackingModule,
    FinanceModule,
    GlModule,
    PurchasingModule,
    IntegrationsModule,
    ReportsModule,
    // داشبورد BI — KPI و طبقه‌بندی ABC روی materialized viewهای گزارش‌دهی
    BiModule,
    // بهینه‌ساز مسیر ویزیت (TSP) روی مختصاتِ PostGIS مشتریان
    RoutingModule,
    // پورتال B2B مشتریان — هویتِ جداگانه (portal_user) و JWT با audience مجزا
    PortalModule,
    // خودخدمت‌دهیِ استقرار — ساختِ اتمیِ اجارهٔ جدید (شرکت/شعبه/نقش‌ها/مدیر)
    OnboardingModule,
    // صورتحسابِ اشتراک (ledger، فقط خواندن) — بدونِ درگاهِ پرداخت/اشتراکِ پولی
    BillingModule,
    SettingsModule,
    // ضمیمه‌ها و مدرک تحویل (POD) روی آبجکت‌استوریج MinIO/S3
    AttachmentsModule,
    // لایهٔ مشترک C3 — همان سرویسها، مالک از مسیر، ممیزی تراکنشی
    EntityAttachmentsModule,
    // مرکز انتقال C4 — بستهٔ کنترلشده، تاریخچهٔ audit_log، اجرای fail-closed
    AttachmentTransferModule,
  ],
  providers: [
    // قرارداد Error با request_id برای همهٔ استثناها — باگ‌ها فقط در سمت سرور لاگ می‌شوند
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // فعال‌سازی RLS: connection اختصاصی هر درخواست احراز‌شده + app.company_id/app.user_id
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
