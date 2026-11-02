import { Controller, Get, Post } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';

@Controller('routing')
export class RoutingController {
  @Get()
  info(): ModuleInfo {
    return { module: 'routing', title: 'بهینه‌ساز مسیر هوشمند', resources: ['optimize', 'alternatives'], status: 'scaffold' };
  }

  @Post('optimize')
  optimize() {
    return {
      route_id: null,
      stops: [],
      total_distance_km: 0,
      total_duration_min: 0,
      savings_percent: 0,
    };
  }
}

import { Module } from '@nestjs/common';
@Module({ controllers: [RoutingController] })
export class RoutingModule {}
