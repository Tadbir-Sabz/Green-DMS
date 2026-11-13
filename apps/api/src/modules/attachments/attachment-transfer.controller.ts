import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from '../master-data/domain-boundary.guard';
import { TRANSFER_MAX_PACKAGE_BYTES, findForbiddenClientFields } from './attachment-transfer.rules';
import type { UploadedFile as StoredFile } from './attachments.service';
import { AttachmentTransferService } from './attachment-transfer.service';
import type {
  TransferActor,
  TransferExportPreview,
  TransferHistoryItem,
  TransferImportPreview,
  TransferOperationDetail,
  TransferOwnerRecord,
  TransferOwnerTypeOption,
} from './attachment-transfer.types';

/**
 * مرکز انتقال ضمائم (TASK-PM-02-C4) — مسیرها فقط همان مجوزهای مصوب را دارند؛
 * هیچ مجوز، نقش، مالک، دامنه، شرکت، سیاست حذف یا گردش تأیید تازهای ساخته نشد.
 *
 * `DomainBoundaryGuard` روی کل کنترلر است تا `x-domain-id`/کلیدهای دامنهای
 * صریحاً رد شوند (نه حذف بیصدای ValidationPipe). در سرویس هم بدنه/کوئری با
 * allowlist سختگیر و فیلدهای ممنوع بررسی میشود؛ مالک و شرکت فقط از نشست و
 * مسیر/manifest سرورساخته میآیند.
 *
 * دانلود بسته، باینری همانOrigin با `Authorization` است؛ URL امضاشده، کلید
 * استوریج، bucket، توکن یا اطلاعات زیرساخت در پاسخ/تاریخچه/ممیزی نیست.
 */
@UseGuards(AuthGuard, PermissionsGuard, DomainBoundaryGuard)
@Controller('attachment-transfer')
export class AttachmentTransferController {
  constructor(private readonly service: AttachmentTransferService) {}

  private actor(user: AuthContext): TransferActor {
    return { companyId: user.companyId, userId: user.userId };
  }

  /** هیچ فیلد کوئری تعریفنشده یا ممنوعی بیصدا حذف/پذیرفته نمیشود. */
  private assertNoQuery(query: unknown): void {
    const obj = query && typeof query === 'object' && !Array.isArray(query)
      ? query as Record<string, unknown>
      : {};
    const forbidden = findForbiddenClientFields(obj);
    if (forbidden.length > 0) {
      throw new BadRequestException({
        code: 'forbidden_client_field',
        message_fa: 'فیلدهای مالکیت، اجاره، دامنه یا زیرساخت از کلاینت پذیرفته نمیشود.',
        details: { fields: forbidden },
      });
    }
    const unsupported = Object.keys(obj).sort();
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_request_field',
        message_fa: 'فیلدهای ارسالی در قرارداد تعریف نشدهاند.',
        details: { fields: unsupported },
      });
    }
  }

  @Get('owner-types')
  @RequirePermissions('attachment.view')
  ownerTypes(
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<{ items: TransferOwnerTypeOption[]; note_fa: string }> {
    this.assertNoQuery(query);
    return this.service.ownerTypes(this.actor(user));
  }

  @Get('owners')
  @RequirePermissions('attachment.view')
  owners(
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<{ items: TransferOwnerRecord[]; note_fa: string }> {
    return this.service.owners(this.actor(user), query);
  }

  @Post('exports/preview')
  @RequirePermissions('attachment.view')
  @HttpCode(200)
  exportPreview(
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<TransferExportPreview> {
    this.assertNoQuery(query);
    return this.service.exportPreview(this.actor(user), body ?? {}, meta);
  }

  @Get('exports/:operationId/package')
  @RequirePermissions('attachment.view')
  async exportPackage(
    @Param('operationId') operationId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    this.assertNoQuery(query);
    const result = await this.service.exportPackage(this.actor(user), operationId, meta);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', String(result.size));
    res.setHeader('X-Transfer-Package-Sha256', result.packageSha256);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(result.zip);
  }

  @Post('imports/preview')
  @RequirePermissions('attachment.view', 'attachment.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TRANSFER_MAX_PACKAGE_BYTES } }))
  @HttpCode(200)
  importPreview(
    @UploadedFile() file: StoredFile | undefined,
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<TransferImportPreview> {
    this.assertNoQuery(query);
    return this.service.importPreview(this.actor(user), file, body ?? {}, meta);
  }

  @Get('imports/:operationId')
  @RequirePermissions('attachment.view')
  importStatus(
    @Param('operationId') operationId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<TransferImportPreview> {
    this.assertNoQuery(query);
    return this.service.importStatus(this.actor(user), operationId);
  }

  @Post('imports/:operationId/mappings')
  @RequirePermissions('attachment.view', 'attachment.upload')
  @HttpCode(200)
  updateMappings(
    @Param('operationId') operationId: string,
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<TransferImportPreview> {
    this.assertNoQuery(query);
    return this.service.updateMappings(this.actor(user), operationId, body ?? {}, meta);
  }

  /** مسیر عمداً وجود دارد تا «نبود گردش مصوب» در ممیزی ثبت و اجرا رد شود. */
  @Post('imports/:operationId/execute')
  @RequirePermissions('attachment.view', 'attachment.upload')
  @HttpCode(200)
  execute(
    @Param('operationId') operationId: string,
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<never> {
    this.assertNoQuery(query);
    return this.service.execute(this.actor(user), operationId, body ?? {}, meta);
  }

  /** لغو فقط وضعیت پیشنمایش حافظه را بیاعتبار میکند؛ حذف/بایگانی انجام نمیشود. */
  @Post('operations/:operationId/cancel')
  @RequirePermissions('attachment.view', 'attachment.upload')
  @HttpCode(200)
  cancel(
    @Param('operationId') operationId: string,
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<{ operation_id: string; status: 'cancelled'; note_fa: string }> {
    this.assertNoQuery(query);
    return this.service.cancel(this.actor(user), operationId, body ?? {}, meta);
  }

  @Get('operations')
  @RequirePermissions('attachment.view')
  history(
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<{ items: TransferHistoryItem[]; note_fa: string }> {
    return this.service.history(this.actor(user), query);
  }

  @Get('operations/:operationId')
  @RequirePermissions('attachment.view')
  operationDetail(
    @Param('operationId') operationId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<TransferOperationDetail> {
    this.assertNoQuery(query);
    return this.service.operationDetail(this.actor(user), operationId);
  }
}
