import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import type { CategoryRow, ReferenceRepository, UnitRow } from './reference.repository';
import { REFERENCE_REPOSITORY } from './tokens';

/**
 * داده‌های مرجع اطلاعات پایه — فقط خواندن، طبق openapi:
 *   GET /product-categories — دسته‌بندی‌های شرکتِ نشست (برای فرم کالا)
 *   GET /units              — واحدهای اندازه‌گیری سراسری
 * هر دو پشت AuthGuard + PermissionsGuard با مجوز master.product.view.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ReferenceController {
  constructor(
    @Inject(REFERENCE_REPOSITORY) private readonly repo: ReferenceRepository,
  ) {}

  @Get('product-categories')
  @RequirePermissions('master.product.view')
  categories(
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: CategoryRow[] }> {
    return this.repo.findCategories(companyId).then((items) => ({ items }));
  }

  @Get('units')
  @RequirePermissions('master.product.view')
  units(): Promise<{ items: UnitRow[] }> {
    return this.repo.findUnits().then((items) => ({ items }));
  }
}
