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
    @CurrentUser('userId') userId: string,
  ): Promise<ReturnView> {
    // TASK-24Y: ثبتِ درخواست‌دهنده برای جداسازیِ وظایف
    return this.service.create(companyId, dto, userId);
  }

  @Get(':id')
  @RequirePermissions('sales.return.request')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ReturnView> {
    return this.service.get(companyId, id);
  }

  /** TASK-24Z — ارسال به گردشِ تأیید (ساختِ اتصال). */
  @Post(':id/request-approval')
  @HttpCode(201)
  @RequirePermissions('sales.return.request')
  requestApproval(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.requestApproval(companyId, id, userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('sales.return.approve')
  approve(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<ReturnView> {
    // TASK-24Y: هویتِ تأییدکننده لازم است (منعِ خودتأییدی + ممیزی)
    return this.service.approve(companyId, id, userId);
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
