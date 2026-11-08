import { Controller, Get } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { PricingModule } from '../pricing/pricing.module';
import { AreaController } from './area.controller';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';
import { OrderController } from './order.controller';
import { ReturnController } from './return.controller';
import { ReturnRepository } from './return.repository';
import { ReturnService } from './return.service';
import { WaybillController } from './waybill.controller';
import { WaybillRepository } from './waybill.repository';
import { WaybillService } from './waybill.service';
import { OrderRepository } from './order.repository';
import { OrderCreationLock } from './order-creation-lock';
import { OrderService } from './order.service';
import { RouteController } from './route.controller';
import { StructureRepository } from './structure.repository';
import { StructureService } from './structure.service';
import { SalesChainRepository } from './sales-chain.repository';
import { DeliveryService, InvoiceService, RequestService } from './sales-chain.service';
import {
  DeliveryController,
  InvoiceController,
  RequestController,
} from './sales-chain.controller';
import {
  CUSTOMER_REPOSITORY,
  CUSTOMER_SERVICE,
  DELIVERY_REPOSITORY,
  DELIVERY_SERVICE,
  INVOICE_REPOSITORY,
  INVOICE_SERVICE,
  ORDER_REPOSITORY,
  ORDER_SERVICE,
  REQUEST_REPOSITORY,
  REQUEST_SERVICE,
  RETURN_REPOSITORY,
  RETURN_SERVICE,
  STRUCTURE_REPOSITORY,
  STRUCTURE_SERVICE,
  WAYBILL_REPOSITORY,
  WAYBILL_SERVICE,
} from './tokens';

/** ماژول ۴ — فروش (مسیر، مشتری، سفارش، حواله، فاکتور، مرجوعی) */
@Controller('sales')
export class SalesController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'sales',
      title: 'فروش',
      resources: [
        'regions-routes',
        'customers',
        'customer-requests',
        'sales-orders',
        'waybills',
        'invoices',
        'discount-assignments',
        'delivery-tracking',
        'return-requests',
        'return-confirmations',
      ],
      status: 'scaffold',
    };
  }
}

/**
 * ماژول ۴ — پیاده‌شده: حوزه و مسیر (/areas، /routes)، مشتریان (/customers، /customers/{id} و ثبت موقعیت نقشه)
 * و سفارش فروش (/orders، /orders/{id}، تأیید).
 * IdentityRbacModule برای گاردهای AuthGuard/PermissionsGuard وارد می‌شود
 * (گاردهای کنترلر در همین ماژول نمونه‌سازی می‌شوند و به providerهای آن نیاز دارند).
 */
@Module({
  imports: [IdentityRbacModule, RulesEngineModule, PricingModule],
  controllers: [
    SalesController,
    AreaController,
    CustomerController,
    RouteController,
    OrderController,
    WaybillController,
    ReturnController,
    RequestController,
    InvoiceController,
    DeliveryController,
  ],
  providers: [
    CustomerRepository,
    { provide: CUSTOMER_REPOSITORY, useExisting: CustomerRepository },
    CustomerService,
    { provide: CUSTOMER_SERVICE, useExisting: CustomerService },
    StructureRepository,
    { provide: STRUCTURE_REPOSITORY, useExisting: StructureRepository },
    StructureService,
    { provide: STRUCTURE_SERVICE, useExisting: StructureService },
    OrderRepository,
    { provide: ORDER_REPOSITORY, useExisting: OrderRepository },
    OrderService,
    OrderCreationLock,
    { provide: ORDER_SERVICE, useExisting: OrderService },
    WaybillRepository,
    { provide: WAYBILL_REPOSITORY, useExisting: WaybillRepository },
    WaybillService,
    { provide: WAYBILL_SERVICE, useExisting: WaybillService },
    ReturnRepository,
    { provide: RETURN_REPOSITORY, useExisting: ReturnRepository },
    ReturnService,
    { provide: RETURN_SERVICE, useExisting: ReturnService },
    SalesChainRepository,
    { provide: REQUEST_REPOSITORY, useExisting: SalesChainRepository },
    { provide: INVOICE_REPOSITORY, useExisting: SalesChainRepository },
    { provide: DELIVERY_REPOSITORY, useExisting: SalesChainRepository },
    RequestService,
    { provide: REQUEST_SERVICE, useExisting: RequestService },
    InvoiceService,
    { provide: INVOICE_SERVICE, useExisting: InvoiceService },
    DeliveryService,
    { provide: DELIVERY_SERVICE, useExisting: DeliveryService },
  ],
})
export class SalesModule {}
