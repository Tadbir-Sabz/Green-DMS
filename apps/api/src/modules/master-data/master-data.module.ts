import { CatalogFoundationController, CatalogFoundationService } from './catalog-foundation.controller';
import { ProductPackagingService } from './product-packaging.service';
import { CatalogAccess } from './catalog-access.service';
import { DomainCatalogGate } from './domain-catalog.contract';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ProductDomainScopeController } from './product-domain-scope.controller';
import { ProductDomainScopeService } from './product-domain-scope.service';
import { OrderCreationLock } from '../sales/order-creation-lock';
import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { PricingModule } from '../pricing/pricing.module';
import { MasterDataController } from './master-data.controller';
import { MasterDataRepository } from './master-data.repository';
import { PackagingController } from './packaging.controller';
import { PersonController } from './person.controller';
import { PersonRepository } from './person.repository';
import { PersonService } from './person.service';
import { ProductBarcodeController } from './product-barcode.controller';
import { ProductCatalogController } from './product-catalog.controller';
import { ProductController } from './product.controller';
import { ProductExportController } from './product-export.controller';
import { ProductExportService } from './product-export.service';
import { ProductBulkMaintenanceController } from './product-bulk-maintenance.controller';
import { ProductBulkMaintenanceService } from './product-bulk-maintenance.service';
import { ProductBulkMaintenanceRepository } from './product-bulk-maintenance.repository';
import { ProductImportController } from './product-import.controller';
import { ProductMasterRepository } from './product-master.repository';
import { ProductMasterService } from './product-master.service';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { ReferenceController } from './reference.controller';
import { PriceListController } from './price-list.controller';
import { PromotionController } from './promotion.controller';
import { PricingRepository } from './pricing.repository';
import { PricingService } from './pricing.service';
import { ReferenceRepository } from './reference.repository';
import { StaffController } from './staff.controller';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import {
  MASTER_DATA_REPOSITORY,
  PERSON_REPOSITORY,
  PERSON_SERVICE,
  PRICING_REPOSITORY,
  PRICING_SERVICE,
  PRODUCT_REPOSITORY,
  PRODUCT_SERVICE,
  REFERENCE_REPOSITORY,
  STAFF_REPOSITORY,
  STAFF_SERVICE,
} from './tokens';

/**
 * ماژول ۱ — اطلاعات پایه. پیاده‌شده: CRUD کالا (/products)، CRUD اشخاص
 * (/persons — پایه مشتری/پرسنل)، CRUD پرسنل (/staff — سمت، سرپرست، حوزه کار)
 * و داده‌های مرجع فرم کالا (/product-categories، /units).
 * IdentityRbacModule برای گاردهای AuthGuard/PermissionsGuard وارد می‌شود
 * (گاردهای کنترلر در همین ماژول نمونه‌سازی می‌شوند و به providerهای آن نیاز دارند).
 */
@Module({
  imports: [IdentityRbacModule, PricingModule],
  controllers: [
    CatalogFoundationController,
    MasterDataController,
    // نکته: کنترلرهای Product Master باید قبل از ProductController ثبت شوند تا
    // مسیرهای literal زیرمجموعهٔ /products (مثل duplicate-check) قبل از ':id' match شوند.
    ProductImportController,
    ProductDomainScopeController,
    ProductBarcodeController,
    ProductCatalogController,
    ProductExportController,
    ProductBulkMaintenanceController,
    ProductController,
    PackagingController,
    PersonController,
    StaffController,
    ReferenceController,
    PriceListController,
    PromotionController,
  ],
  providers: [
    CatalogAccess,
    OrderCreationLock,
    DomainCatalogGate,
    DomainBoundaryGuard,
    ProductDomainScopeService,
    CatalogFoundationService,
    ProductPackagingService,
    ProductMasterRepository,
    ProductMasterService,
    ProductRepository,
    { provide: PRODUCT_REPOSITORY, useExisting: ProductRepository },
    ProductService,
    { provide: PRODUCT_SERVICE, useExisting: ProductService },
    ProductExportService,
    ProductBulkMaintenanceService,
    ProductBulkMaintenanceRepository,
    MasterDataRepository,
    { provide: MASTER_DATA_REPOSITORY, useExisting: MasterDataRepository },
    PersonRepository,
    { provide: PERSON_REPOSITORY, useExisting: PersonRepository },
    PersonService,
    { provide: PERSON_SERVICE, useExisting: PersonService },
    StaffRepository,
    { provide: STAFF_REPOSITORY, useExisting: StaffRepository },
    StaffService,
    { provide: STAFF_SERVICE, useExisting: StaffService },
    ReferenceRepository,
    { provide: REFERENCE_REPOSITORY, useExisting: ReferenceRepository },
    PricingRepository,
    { provide: PRICING_REPOSITORY, useExisting: PricingRepository },
    PricingService,
    { provide: PRICING_SERVICE, useExisting: PricingService },
  ],
  exports: [PRODUCT_SERVICE],
})
export class MasterDataModule {}
