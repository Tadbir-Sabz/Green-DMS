import { Controller, Get } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';

/** نمای اطلاعاتی ماژول ۱ — فهرست منابع و وضعیت پیاده‌سازی هر کدام */
@Controller('master-data')
export class MasterDataController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'master-data',
      title: 'اطلاعات پایه',
      resources: [
        'products',
        'product-categories',
        'prices',
        'discounts-bonuses',
        'persons',
        'staff',
        'job-positions',
        'sales-areas',
        'warehouses',
        'vehicles',
        'supervisors',
        'settlement-terms',
      ],
      status: 'scaffold',
    };
  }
}
