import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateChequeDto, ListChequesQueryDto, UpdateChequeDto } from './finance.dto';
import type { ChequeRow } from './finance-write.repository';
import type { ChequeService } from './cheque.service';
import { CHEQUE_SERVICE } from './tokens';

/**
 * چک‌ها — /cheques و /cheques/{id} مطابق openapi.yaml.
 * خواندن treasury.cheque.view؛ ثبت/تعیین تکلیف treasury.cheque.update.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('cheques')
export class ChequeController {
  constructor(@Inject(CHEQUE_SERVICE) private readonly service: ChequeService) {}

  @Get()
  @RequirePermissions('treasury.cheque.view')
  list(
    @Query() query: ListChequesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<ChequeRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('treasury.cheque.update')
  create(
    @Body() dto: CreateChequeDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ChequeRow> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('treasury.cheque.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ChequeRow> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('treasury.cheque.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateChequeDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ChequeRow> {
    return this.service.update(companyId, id, dto);
  }
}
