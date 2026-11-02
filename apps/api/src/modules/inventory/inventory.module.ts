import { Controller, Get } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { StockController } from './stock.controller';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';
import { StocktakeController } from './stocktake.controller';
import { StocktakeRepository } from './stocktake.repository';
import { StocktakeService } from './stocktake.service';
import { TransferController } from './transfer.controller';
import { TransferRepository } from './transfer.repository';
import { TransferService } from './transfer.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';
import {
  STOCK_REPOSITORY,
  STOCK_SERVICE,
  STOCKTAKE_REPOSITORY,
  STOCKTAKE_SERVICE,
  TRANSFER_REPOSITORY,
  TRANSFER_SERVICE,
  WAREHOUSE_REPOSITORY,
  WAREHOUSE_SERVICE,
} from './tokens';

/** ماژول ۲ — انبار و انبارگردانی */
@Controller('inventory')
export class InventoryController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'inventory',
      title: 'انبار و انبارگردانی',
      resources: [
        'warehouses',
        'stock-balances',
        'stock-movements',
        'stock-counts',
        'stock-reservations',
        'batches-expiry',
        'vehicle-loads',
        'transfers',
      ],
      status: 'scaffold',
    };
  }
}

/**
 * ماژول ۲ — پیاده‌شده: انبارها، مانده موجودی، اصلاحیه، انبارگردانی (کامل) و انتقال.
 * IdentityRbacModule برای گاردهای AuthGuard/PermissionsGuard وارد می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [
    InventoryController,
    WarehouseController,
    StockController,
    StocktakeController,
    TransferController,
  ],
  providers: [
    WarehouseRepository,
    { provide: WAREHOUSE_REPOSITORY, useExisting: WarehouseRepository },
    WarehouseService,
    { provide: WAREHOUSE_SERVICE, useExisting: WarehouseService },
    StockRepository,
    { provide: STOCK_REPOSITORY, useExisting: StockRepository },
    StockService,
    { provide: STOCK_SERVICE, useExisting: StockService },
    StocktakeRepository,
    { provide: STOCKTAKE_REPOSITORY, useExisting: StocktakeRepository },
    StocktakeService,
    { provide: STOCKTAKE_SERVICE, useExisting: StocktakeService },
    TransferRepository,
    { provide: TRANSFER_REPOSITORY, useExisting: TransferRepository },
    TransferService,
    { provide: TRANSFER_SERVICE, useExisting: TransferService },
  ],
})
export class InventoryModule {}
