import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
  UpdateLocationDto,
} from './customer.dto';
import type { CustomerRow } from './customer.repository';
import type { CustomerService } from './customer.service';
import { CUSTOMER_SERVICE } from './tokens';

/**
 * CRUD مشتریان — /customers، /customers/{id} و PUT /customers/{id}/location
 * دقیقاً مطابق openapi.yaml (پیشوند /api/v1 توسط main.ts اضافه می‌شود).
 * DELETE در قرارداد نیست؛ وضعیت با status تغییر می‌کند.
 *
 * مجوزها: خواندن/ساخت/ویرایش master.customer.* و ثبت موقعیت در نقشه
 * tracking.customer_geo.update (طبق seed 0022 که ویزیتورها همین را دارند).
 * شرکت از نشست می‌آید نه از query.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomerController {
  constructor(@Inject(CUSTOMER_SERVICE) private readonly service: CustomerService) {}

  @Get()
  @RequirePermissions('master.customer.view')
  list(
    @Query() query: ListCustomersQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<CustomerRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('master.customer.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<CustomerRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('master.customer.create')
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerRow> {
    return this.service.create(companyId, dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('master.customer.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerRow> {
    return this.service.update(companyId, id, dto, userId);
  }

  @Put(':id/location')
  @RequirePermissions('tracking.customer_geo.update')
  setLocation(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerRow> {
    return this.service.setLocation(companyId, id, dto, userId);
  }
}
