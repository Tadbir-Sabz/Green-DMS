import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreateCustomerSegmentDto,
  ListCustomerSegmentsQueryDto,
  UpdateCustomerSegmentDto,
} from './segment.dto';
import type { CustomerSegmentRow } from './segment.repository';
import type { CustomerSegmentService } from './segment.service';
import { CUSTOMER_SEGMENT_SERVICE } from './tokens';

/**
 * بخش‌بندی تجاری مشتری — /customer-segments مطابق openapi.yaml.
 * خواندن master.customer.view؛ ساخت/ویرایش master.customer_segment.manage.
 * شرکت از نشست می‌آید نه از query. حذف وجود ندارد؛ غیرفعال‌سازی جاگزین است.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('customer-segments')
export class CustomerSegmentsController {
  constructor(
    @Inject(CUSTOMER_SEGMENT_SERVICE) private readonly service: CustomerSegmentService,
  ) {}

  @Get()
  @RequirePermissions('master.customer.view')
  async list(
    @Query() query: ListCustomerSegmentsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: CustomerSegmentRow[] }> {
    return { items: await this.service.list(companyId, query) };
  }

  @Get(':id')
  @RequirePermissions('master.customer.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<CustomerSegmentRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('master.customer_segment.manage')
  create(
    @Body() dto: CreateCustomerSegmentDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerSegmentRow> {
    return this.service.create(companyId, dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('master.customer_segment.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerSegmentDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerSegmentRow> {
    return this.service.update(companyId, id, dto, userId);
  }
}
