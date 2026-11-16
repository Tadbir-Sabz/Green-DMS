import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { ReleaseCreditHoldDto, SetCreditHoldDto } from './customer-credit.dto';
import type { CustomerCreditService, CustomerCreditView } from './customer-credit.service';
import { CUSTOMER_CREDIT_SERVICE } from './tokens';

/**
 * اعتبار و مسدودی مشتری — /customers/{id}/credit* مطابق openapi.yaml.
 * خواندن: master.customer.view · مسدودی/رفع: ar.credit.hold (مطابق مهاجرت 0066،
 * که به صاحبان ar.credit.approve اعطا می‌شود). شرکت و بازیگر همیشه از نشست می‌آیند.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomerCreditController {
  constructor(@Inject(CUSTOMER_CREDIT_SERVICE) private readonly service: CustomerCreditService) {}

  @Get(':id/credit')
  @RequirePermissions('master.customer.view')
  detail(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<CustomerCreditView> {
    return this.service.detail(companyId, id);
  }

  @Post(':id/credit/hold')
  @HttpCode(200)
  @RequirePermissions('ar.credit.hold')
  setHold(
    @Param('id') id: string,
    @Body() dto: SetCreditHoldDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerCreditView> {
    return this.service.setHold(companyId, id, dto.reason, userId);
  }

  @Post(':id/credit/release')
  @HttpCode(200)
  @RequirePermissions('ar.credit.hold')
  releaseHold(
    @Param('id') id: string,
    @Body() dto: ReleaseCreditHoldDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CustomerCreditView> {
    return this.service.releaseHold(companyId, id, dto.note ?? null, userId);
  }
}
