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
import { SettingsModule } from './modules/settings/settings.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';

/**
 * ریشه اپ API — چیدمان ماژول‌ها دقیقاً Core Modules سند §۳.۳:
 * Identity & RBAC / Master Data / Inventory / Rules Engine / Sales /
 * Tours & Visits / Tracking & Routing / Finance / Integrations / Reports
 *
 * PortalModule هنوز اینجا ثبت نشده است: اسکلتش دادهٔ ساختگی برمی‌گرداند و تا
 * پیاده‌سازی واقعیِ پورتال B2B سرو نمی‌شود تا endpoint قلابی باز نشود.
 * BiModule (KPI و ABC روی materialized viewهای گزارش‌دهی) و RoutingModule
 * (بهینه‌ساز مسیر TSP روی مختصاتِ PostGIS مشتریان) پیاده‌سازی واقعی شدند و
 * پایین ثبت شده‌اند.
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
    SettingsModule,
    // ضمیمه‌ها و مدرک تحویل (POD) روی آبجکت‌استوریج MinIO/S3
    AttachmentsModule,
  ],
  providers: [
    // قرارداد Error با request_id برای همهٔ استثناها — باگ‌ها فقط در سمت سرور لاگ می‌شوند
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // فعال‌سازی RLS: connection اختصاصی هر درخواست احراز‌شده + app.company_id/app.user_id
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
