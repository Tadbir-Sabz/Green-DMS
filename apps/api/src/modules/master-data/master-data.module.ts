import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { MasterDataController } from './master-data.controller';
import { PersonController } from './person.controller';
import { PersonRepository } from './person.repository';
import { PersonService } from './person.service';
import { ProductController } from './product.controller';
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
  imports: [IdentityRbacModule],
  controllers: [
    MasterDataController,
    ProductController,
    PersonController,
    StaffController,
    ReferenceController,
    PriceListController,
    PromotionController,
  ],
  providers: [
    ProductRepository,
    { provide: PRODUCT_REPOSITORY, useExisting: ProductRepository },
    ProductService,
    { provide: PRODUCT_SERVICE, useExisting: ProductService },
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
