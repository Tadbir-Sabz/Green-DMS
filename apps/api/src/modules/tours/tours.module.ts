import { Controller, Get } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';

/** ماژول ۵ — فروش و توزیع: تورها، بازدید، فروش تلفنی، تسویه و پورسانت */
@Controller('tours')
export class ToursController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'tours',
      title: 'فروش و توزیع (تورها و فروش تلفنی)',
      resources: [
        'tours',
        'tour-assignments',
        'visits',
        'telesales-orders',
        'tour-settlements',
        'commissions',
      ],
      status: 'scaffold',
    };
  }
}

@Module({ controllers: [ToursController] })
export class ToursModule {}
