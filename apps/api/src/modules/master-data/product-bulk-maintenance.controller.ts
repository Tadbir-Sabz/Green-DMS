import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import {
  BulkMaintenanceExecuteDto,
  BulkMaintenanceOperationParamsDto,
  BulkMaintenancePreviewDto,
} from './product-bulk-maintenance.dto';
import { ProductBulkMaintenanceService } from './product-bulk-maintenance.service';
import type {
  BulkMaintenanceFieldsResponse,
  BulkOperationResult,
  BulkPreviewPayload,
} from './product-bulk-maintenance.types';

/**
 * TASK-PM-01D-M4 — controlled bulk maintenance of central catalog fields.
 * All routes require the existing `master.product.update` write permission;
 * `master.product.view` and CSV export never authorize these operations.
 * Registered before ProductController so literal paths remain unambiguous.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products/bulk-maintenance')
export class ProductBulkMaintenanceController {
  constructor(private readonly service: ProductBulkMaintenanceService) {}

  @Get('fields')
  @RequirePermissions('master.product.update')
  fields(@CurrentUser() user: AuthContext): Promise<BulkMaintenanceFieldsResponse> {
    return this.service.fields(user);
  }

  @Post('preview')
  @RequirePermissions('master.product.update')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body() dto: BulkMaintenancePreviewDto,
    @CurrentUser() user: AuthContext,
  ): Promise<BulkPreviewPayload> {
    return this.service.preview(dto, user);
  }

  @Post('execute')
  @RequirePermissions('master.product.update')
  @HttpCode(HttpStatus.OK)
  execute(
    @Body() dto: BulkMaintenanceExecuteDto,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<BulkOperationResult> {
    return this.service.execute(dto, user, meta);
  }

  /** genuinely read-only status (TASK-PM-01D-M4-F): no ledger state transition. */
  @Get('operations/:operationId')
  @RequirePermissions('master.product.update')
  operationStatus(
    @Param() params: BulkMaintenanceOperationParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<BulkOperationResult> {
    return this.service.operationStatus(params.operationId, user);
  }

  /** explicit, audited reconciliation action; GET above never mutates. */
  @Post('operations/:operationId/reconcile')
  @RequirePermissions('master.product.update')
  @HttpCode(HttpStatus.OK)
  reconcileOperation(
    @Param() params: BulkMaintenanceOperationParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<BulkOperationResult> {
    return this.service.reconcileOperation(params.operationId, user);
  }
}
