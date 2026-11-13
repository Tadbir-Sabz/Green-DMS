import { ProductPackagingService } from './product-packaging.service';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsDefined, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { AuditService } from '../../common/audit.service';
import { AUDIT_SERVICE } from '../../common/audit.service';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { MASTER_DATA_REPOSITORY } from './tokens';
import type { MasterDataRepository } from './master-data.repository';
import { ProductMasterService } from './product-master.service';
import { assertSensitiveConfirmed } from './product-sensitivity';

/** واحد اندازه‌گیری — مرجع سراسری (کد مشترک همه شرکت‌ها) */
export class CreateUomDto {
  @IsDefined()
  @IsString()
  @MaxLength(16)
  code: string;

  @IsDefined()
  @IsString()
  @MaxLength(64)
  title: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimal_places?: number;
}

export class CreateProductPackagingDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsDefined()
  @IsUUID('4')
  uom_id: string;

  @IsDefined()
  @IsNumber()
  @Min(0.000001)
  factor_to_base: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsBoolean()
  is_sales_default?: boolean;

  @IsOptional()
  @IsBoolean()
  is_purchase_default?: boolean;

  /**
   * D4: فاکتورِ تبدیل حساس است — تأییدِ صریحِ دومرحله‌ای الزامی است
   * (fallback پیش از G-03: RBAC + confirm + audit).
   */
  @IsOptional()
  @IsBoolean()
  confirm_sensitive?: boolean;
}

export class SetDefaultPackagingDto {
  @IsOptional()
  @IsBoolean()
  is_sales_default?: boolean;
}

/**
 * بسته‌بندی — /packaging/uom و /packaging/product-packaging.
 * همه عملیات product_packaging به شرکت نشست محدود می‌شوند (فاز B — ایزوله‌سازی)؛
 * uom مرجع سراسری است و مانند سایر شرکت‌ها مشترک خوانده/نوشته می‌شود.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('packaging')
export class PackagingController {
  constructor(
    private readonly packaging: ProductPackagingService,
    @Inject(MASTER_DATA_REPOSITORY) private readonly repo: MasterDataRepository,
    private readonly productMaster: ProductMasterService,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  @Get('uom')
  @RequirePermissions('master.product.view')
  listUom(@CurrentUser('companyId') companyId: string) {
    return this.repo.listUom(companyId);
  }

  @Post('uom')
  @RequirePermissions('master.product.update')
  async createUom(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateUomDto,
    @RequestMetaParam() meta: RequestMeta,
  ) { return this.packaging.createUom(user, dto, meta); }

  @Get('product-packaging/:productId')
  @RequirePermissions('master.product.view')
  async listProductPackaging(
    @CurrentUser('companyId') companyId: string,
    @Param('productId') productId: string,
  ) {
    // محصولِ شرکت دیگر همان 404 «یافت نشد» را می‌گیرد تا وجودش لو نرود
    const rows = await this.repo.listProductPackaging(companyId, productId);
    if (rows.length === 0) {
      const owner = await this.repo.productBelongsToCompany(companyId, productId);
      if (!owner) {
        throw new NotFoundException({
          code: 'not_found',
          message_fa: 'کالای درخواستی در این شرکت یافت نشد.',
        });
      }
    }
    return rows;
  }

  @Post('product-packaging')
  @RequirePermissions('master.product.update')
  async createProductPackaging(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateProductPackagingDto,
    @RequestMetaParam() meta: RequestMeta,
  ) { return this.packaging.createProductPackaging(user, dto, meta); }

  @Patch('product-packaging/:id/default')
  @RequirePermissions('master.product.update')
  async setDefaultPackaging(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SetDefaultPackagingDto,
    @RequestMetaParam() meta: RequestMeta,
  ) { return this.packaging.setDefaultPackaging(user, dto, id, meta); }
}
