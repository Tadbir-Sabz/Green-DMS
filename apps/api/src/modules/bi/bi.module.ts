import { Controller, Get } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';

@Controller('bi')
export class BiController {
  @Get()
  info(): ModuleInfo {
    return { module: 'bi', title: 'داشبورد BI تعاملی', resources: ['kpi', 'abc-analysis', 'forecast'], status: 'scaffold' };
  }

  @Get('kpi')
  kpi() {
    return {
      sales_30d: 0,
      ar_balance: 0,
      active_customers: 0,
      active_routes: 0,
      collection_rate: 0,
    };
  }

  @Get('abc-customers')
  abcCustomers() {
    return { a: [], b: [], c: [] };
  }

  @Get('abc-products')
  abcProducts() {
    return { a: [], b: [], c: [] };
  }
}

import { Module } from '@nestjs/common';
@Module({ controllers: [BiController] })
export class BiModule {}
