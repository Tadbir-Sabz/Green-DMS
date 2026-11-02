import { Controller, Get, Post } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';

@Controller('portal')
export class PortalController {
  @Get()
  info(): ModuleInfo {
    return { module: 'portal', title: 'پورتال مشتری آنلاین', resources: ['invoices', 'orders', 'payments'], status: 'scaffold' };
  }

  @Get('invoices')
  invoices() { return []; }

  @Get('balance')
  balance() { return { outstanding: 0 }; }

  @Post('orders')
  createOrder() { return { status: 'submitted' }; }
}

import { Module } from '@nestjs/common';
@Module({ controllers: [PortalController] })
export class PortalModule {}
