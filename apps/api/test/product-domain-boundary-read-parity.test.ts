import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ProductController } from '../src/modules/master-data/product.controller';
import { ProductExportController } from '../src/modules/master-data/product-export.controller';
import { ProductImportController } from '../src/modules/master-data/product-import.controller';
import { ProductDomainScopeController } from '../src/modules/master-data/product-domain-scope.controller';
import { CatalogFoundationController } from '../src/modules/master-data/catalog-foundation.controller';
import { DomainBoundaryGuard } from '../src/modules/master-data/domain-boundary.guard';
import { AuthGuard } from '../src/modules/identity-rbac/auth.guard';
import { PermissionsGuard } from '../src/modules/identity-rbac/permissions.guard';

/**
 * TASK-PM-02-B2 — ساختاری، بدون دیتابیس.
 *
 * PM-02-B1 نگهبان مرز مرکزی/دامنهای را فقط روی سطوح **نوشتنی** و نمای
 * `domain-scope` گذاشته بود. چون `ValidationPipe` سراسری `whitelist: true` دارد
 * (بدون `forbidNonWhitelisted`)، کلید query دامنهای روی سطوح **خواندنی** بیتصدا
 * حذف میشد: مشتری `?available=true` میفرستاد و همان صفحه/CSV مرکزی کامل را
 * «دامنهای» میپنداشت. B2 فقط همان نگهبان را به فهرست/جزئیات/خروجی CSV/گزارش
 * import میگستراند؛ هیچ هویت، عضویت، وضعیت، اختیار، مهاجرت یا RLS دامنهای
 * نساخته است. این تست ثابت میکند (الف) پوشش همسان و (ب) نبودِ رد سراسری مسیرهای
 * زمینهٔ دامنه که عمداً هدر `x-domain-id` را میخوانند.
 */
const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/modules/master-data',
);
const guards = (target: unknown): Function[] =>
  (Reflect.getMetadata(GUARDS_METADATA, target as object) as Function[] | undefined) ?? [];
const ownGuards = (target: unknown): Function[] =>
  (Reflect.getOwnMetadata(GUARDS_METADATA, target as object) as Function[] | undefined) ?? [];

describe('TASK-PM-02-B2 central read-surface boundary parity (DB-free)', () => {
  const readHandlers: [string, Function, object][] = [
    ['GET /products', ProductController.prototype.list, ProductController],
    ['GET /products/{id}', ProductController.prototype.get, ProductController],
    ['GET /products/export', ProductExportController.prototype.export, ProductExportController],
    ['GET /products/import/report/{id}', ProductImportController.prototype.report, ProductImportController],
    ['GET /products/{id}/domain-scope', ProductDomainScopeController.prototype.getScope, ProductDomainScopeController],
  ];

  it('every central read/export/report handler carries DomainBoundaryGuard', () => {
    for (const [label, handler, cls] of readHandlers) {
      const effective = [...guards(cls), ...ownGuards(handler)];
      expect(
        effective,
        `${label} فاقد DomainBoundaryGuard است؛ کلید query دامنهای بیتصدا حذف میشود`,
      ).toContain(DomainBoundaryGuard);
    }
  });

  it('AuthGuard and PermissionsGuard still run before the boundary guard', () => {
    for (const [label, handler, cls] of readHandlers) {
      const classGuards = guards(cls);
      expect(classGuards, `${label} فاقد AuthGuard`).toContain(AuthGuard);
      expect(classGuards, `${label} فاقد PermissionsGuard`).toContain(PermissionsGuard);
      expect(classGuards.indexOf(AuthGuard)).toBeLessThan(classGuards.indexOf(PermissionsGuard));
      // ممیزی ردشدنها باید هویت سروریشده داشته باشد؛ نگهبان مرز آخر میآید.
      if (classGuards.includes(DomainBoundaryGuard)) {
        expect(
          classGuards.indexOf(PermissionsGuard),
          `${label}: نگهبان مرز پیش از مجوز اجرا میشود`,
        ).toBeLessThan(classGuards.indexOf(DomainBoundaryGuard));
      }
    }
  });

  it('domain-context routes are NOT blanket-rejected (no DomainBoundaryGuard)', () => {
    const contextHandlers: Function[] = [
      CatalogFoundationController.prototype.contract,
      CatalogFoundationController.prototype.domain,
      CatalogFoundationController.prototype.domains,
      CatalogFoundationController.prototype.currentDomain,
      CatalogFoundationController.prototype.domainProducts,
      CatalogFoundationController.prototype.productMembership,
      CatalogFoundationController.prototype.productMembershipHistory,
    ];
    expect(ownGuards(CatalogFoundationController)).not.toContain(DomainBoundaryGuard);
    for (const handler of contextHandlers) {
      expect(ownGuards(handler)).not.toContain(DomainBoundaryGuard);
    }
    // هدر زمینهٔ دامنه عمداً همچنان خوانده میشود (fail-closed از طریق DomainCatalogGate).
    const src = readFileSync(path.join(SRC, 'catalog-foundation.controller.ts'), 'utf8');
    expect(src).toContain('@Headers("x-domain-id")');
  });

  it('no operational-domain authority provider is registered (gate stays fail-closed)', () => {
    const moduleSrc = readFileSync(path.join(SRC, 'master-data.module.ts'), 'utf8');
    expect(moduleSrc).toContain('DomainBoundaryGuard');
    expect(moduleSrc).not.toMatch(/OPERATIONAL_DOMAIN_AUTHORITY/);
  });
});
