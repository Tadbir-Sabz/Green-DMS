import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { ProductMasterService } from './product-master.service';

export class CreateBarcodeDto {
  @IsString()
  @MaxLength(64)
  barcode: string;

  @IsIn(['gs1_ean13', 'gs1_ean8', 'gs1_upc', 'gs1_itf14', 'internal', 'other'])
  kind: string;

  @IsOptional()
  @IsUUID('4')
  packaging_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

/**
 * بارکدهای کالا (H-1) + resolution قطعیِ اسکن.
 * یکتاییِ نوع‌محور در DB (gs1 جهانی / داخلیِ شرکت) + حفاظتِ race با unique index.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products')
export class ProductBarcodeController {
  constructor(private readonly service: ProductMasterService) {}

  @Get(':id/barcodes')
  @RequirePermissions('master.product.view')
  list(@CurrentUser('companyId') companyId: string, @Param('id') id: string) {
    return this.service.listBarcodes(companyId, id);
  }

  @Post(':id/barcodes')
  @RequirePermissions('master.product.update')
  create(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateBarcodeDto,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.addBarcode(user.companyId, id, dto, meta, user.userId);
  }

  @Delete('barcodes/:barcodeId')
  @RequirePermissions('master.product.update')
  async remove(
    @CurrentUser() user: AuthContext,
    @Param('barcodeId') barcodeId: string,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    await this.service.removeBarcode(user.companyId, barcodeId, meta, user.userId);
    return { deleted: true };
  }

  /** اسکن/جست‌وجوی قطعی: بارکد ← کد ← alias نوعِ code (برخوردِ چندپاسخی = خطای صریح) */
  @Get('scan/:code')
  @RequirePermissions('master.product.view')
  scan(@CurrentUser('companyId') companyId: string, @Param('code') code: string) {
    return this.service.scanResolve(companyId, decodeURIComponent(code));
  }
}
