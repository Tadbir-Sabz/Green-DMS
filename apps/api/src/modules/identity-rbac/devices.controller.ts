import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './auth-context.decorator';
import { CreateDeviceDto, ListDevicesQueryDto } from './devices.dto';
import type { DeviceRow } from './devices.repository';
import type { DevicesService } from './devices.service';
import { DEVICES_SERVICE } from './tokens';

/**
 * دستگاه‌های مجاز — openapi › /devices و /devices/{id}:
 * GET فهرست دستگاه‌های کاربر جاری، POST ثبت دستگاه (پیش‌شرط device_bind)
 * و DELETE ابطال از راه دور. فقط AuthGuard لازم دارند چون دامنه هر درخواست
 * از نشست می‌آید (دستگاه‌های خودِ کاربر) و مجوز جداگانه‌ای در seed 0022 نیست.
 */
@UseGuards(AuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(@Inject(DEVICES_SERVICE) private readonly service: DevicesService) {}

  @Get()
  list(
    @Query() query: ListDevicesQueryDto,
    @CurrentUser('userId') userId: string,
  ): Promise<Page<DeviceRow>> {
    return this.service.list(userId, query);
  }

  @Post()
  create(@Body() dto: CreateDeviceDto, @CurrentUser('userId') userId: string): Promise<DeviceRow> {
    return this.service.create(userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string): Promise<void> {
    return this.service.remove(userId, id);
  }
}
