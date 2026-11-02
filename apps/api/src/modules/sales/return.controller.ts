import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateReturnDto, ListReturnsQueryDto, ReceiveReturnDto } from './return.dto';
import type { ReturnRow } from './return.repository';
import type { ReturnService, ReturnView } from './return.service';
import { RETURN_SERVICE } from './tokens';

/**
 * مرجوعی — /returns، /returns/{id}/approve و /returns/{id}/receive مطابق openapi.yaml.
 * ثبت با sales.return.request؛ تأیید با sales.return.approve؛ دریافت/ثبت نهایی با sales.return.post.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('returns')
export class ReturnController {
  constructor(@Inject(RETURN_SERVICE) private readonly service: ReturnService) {}

  @Get()
  @RequirePermissions('sales.return.request')
  list(
    @Query() query: ListReturnsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<ReturnRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('sales.return.request')
  create(
    @Body() dto: CreateReturnDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ReturnView> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('sales.return.request')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ReturnView> {
    return this.service.get(companyId, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('sales.return.approve')
  approve(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ReturnView> {
    return this.service.approve(companyId, id);
  }

  @Post(':id/receive')
  @HttpCode(200)
  @RequirePermissions('sales.return.post')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveReturnDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ReturnView> {
    return this.service.receive(companyId, id, dto);
  }
}
