import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { ProductMasterService } from './product-master.service';
import { DomainBoundaryGuard } from './domain-boundary.guard';

export class ImportValidateDto {
  @IsString()
  @IsNotEmpty()
  csv: string;
}

export class ImportCommitDto {
  @IsString()
  @IsNotEmpty()
  csv: string;

  @IsIn(['create', 'update', 'upsert'])
  mode: 'create' | 'update' | 'upsert';

  /** کلیدِ idempotency سمتِ کلاینت (hash محتوا + توکنِ کلاینت) */
  @IsString()
  @MaxLength(128)
  idempotency_key: string;

  /** M-5: ردیف‌های دارایِ فیلدِ حساس فقط با تأییدِ صریحِ دومرحله‌ای */
  @IsOptional()
  @IsBoolean()
  confirm_sensitive?: boolean;
}

/**
 * import انبوهِ کالا (§E): آپلود → اعتبارسنجی/پیش‌نمایش → تأیید → گزارش.
 * مجوزِ `master.product.import` + audit + idempotency + همه‌یاهیچ در هر دسته.
 * شرکت فقط از نشست — هرگز از CSV (قاعدهٔ TASK-14).
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products/import')
export class ProductImportController {
  constructor(private readonly service: ProductMasterService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('master.product.import')
  @UseGuards(DomainBoundaryGuard)
  validate(@CurrentUser('companyId') companyId: string, @Body() dto: ImportValidateDto) {
    return this.service.validateImport(companyId, dto.csv);
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('master.product.import')
  @UseGuards(DomainBoundaryGuard)
  commit(
    @CurrentUser() user: AuthContext,
    @Body() dto: ImportCommitDto,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.commitImport(user.companyId, dto, meta, user.userId);
  }

  @Get('report/:id')
  @RequirePermissions('master.product.import')
  report(@CurrentUser('companyId') companyId: string, @Param('id') id: string) {
    return this.service.getImport(companyId, id);
  }
}
