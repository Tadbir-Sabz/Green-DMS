import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { MAX_UPLOAD_BYTES, type UploadedFile as StoredFile } from '../attachments/attachments.service';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ProductMediaService } from './product-media.service';

/**
 * مرکز تصاویر و اسناد کالا (TASK-PM-02-C1) — سه مسیر محصولمحور:
 *   GET  /products/{id}/media                 فهرست + تصویرِ اصلی خودکار (§B4)
 *   POST /products/{id}/media                بارگذاری multipart (فقط فیلد file)
 *   GET  /products/{id}/media/{mediaId}/url  URL امضاشدهٔ تازه برای همان کالا
 *
 * `DomainBoundaryGuard` روی هر سه مسیر است تا همسانیِ سطوح خواندنیِ B2 حفظ شود:
 * کلید/هدر دامنهای پیش از `ValidationPipe` (whitelist) صریحاً ۴۰۰ میگیرد، نه اینکه
 * بیصدا حذف شود. این گارد هیچ هویت/عضویت/دسترسپذیری دامنهای ایجاد نمیکند.
 *
 * مجوزها: علاوه بر `master.product.view|update` (§F)، مجوزهای موجودِ
 * `attachment.view|upload` هم خواسته میشوند تا این مسیر جدید هیچگاه از سطح
 * دسترسی `/attachments` عمومی ضعیفتر نباشد. هیچ مجوز تازهای ساخته نشده است.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products')
export class ProductMediaController {
  constructor(private readonly service: ProductMediaService) {}

  @Get(':id/media')
  @RequirePermissions('master.product.view', 'attachment.view')
  @UseGuards(DomainBoundaryGuard)
  list(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.list(user, id);
  }

  @Post(':id/media')
  @RequirePermissions('master.product.update', 'attachment.upload')
  @UseGuards(DomainBoundaryGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @HttpCode(HttpStatus.CREATED)
  upload(
    @Param('id') id: string,
    @UploadedFile() file: StoredFile | undefined,
    @Body() body: Record<string, unknown> | undefined,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    // `Record<string, unknown>` در زمان اجرا Object است؛ ValidationPipe سراسری
    // آن را دستنخورده میگذارد تا فیلدهای مالکیت ارسالی کلاینت قابل تشخیص باشند.
    return this.service.upload(user, id, file, body ?? {}, meta);
  }

  @Get(':id/media/:mediaId/url')
  @RequirePermissions('master.product.view', 'attachment.view')
  @UseGuards(DomainBoundaryGuard)
  url(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.url(user, id, mediaId);
  }
}
