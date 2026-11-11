import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { MAX_UPLOAD_BYTES, type UploadedFile as StoredFile } from './attachments.service';
import { DomainBoundaryGuard } from '../master-data/domain-boundary.guard';
import { EntityAttachmentsService } from './entity-attachments.service';
import {
  ENTITY_ATTACHMENT_CLIENT_OWNER_FIELDS,
  type EntityAttachmentItem,
  type EntityAttachmentView,
} from './entity-attachments.rules';
import type { AttachmentUrlView } from './attachments.dto';

/**
 * ضمائم سازمانی (TASK-PM-02-C3) — سه مسیر **مشترک** برای همهٔ موجودیتهای
 * واجدشرایط، با مالک مشتقشده از مسیر (نه بدنه/کوئری کلاینت):
 *
 *   GET  /entity-attachments/{ownerType}/{ownerId}
 *   POST /entity-attachments/{ownerType}/{ownerId}          (multipart: فقط file)
 *   GET  /entity-attachments/{ownerType}/{ownerId}/{attachmentId}/url
 *
 * `DomainBoundaryGuard` روی هر سه مسیر است تا همسانی سطوح خواندنی/نوشتنی B2
 * حفظ شود: کلید/هدر دامنهای پیش از `ValidationPipe` (whitelist) صریحاً ۴۰۰
 * میگیرد، نه اینکه بیصدا حذف شود. این گارد هیچ هویت/عضویت/دسترسپذیری
 * دامنهای ایجاد نمیکند.
 *
 * مجوزها دقیقاً همان `attachment.view|upload` موجود (مهاجرت ۰۰۳۵) هستند؛
 * هیچ مجوز، نقش یا grant تازهای ساخته نشده است. گارد route + بازاعتبارسنجی
 * DB در سرویس + RLS/FORCE RLS + زنجیرهٔ مالکیت، هر چهار لایه فعالاند.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('entity-attachments')
export class EntityAttachmentsController {
  constructor(private readonly service: EntityAttachmentsService) {}

  /** مالک/شرکت/دامنه در کوئری پذیرفته نمیشود؛ صریحاً ۴۰۰، نه چشمپوشی. */
  private rejectQuery(query: unknown): void {
    if (!query || typeof query !== 'object' || Array.isArray(query)) return;
    const keys = Object.keys(query as Record<string, unknown>);
    if (keys.length === 0) return;
    const ownerFields: ReadonlySet<string> = new Set(ENTITY_ATTACHMENT_CLIENT_OWNER_FIELDS);
    const owned = keys.filter((k) => ownerFields.has(k.toLowerCase())).sort();
    if (owned.length > 0) {
      throw new BadRequestException({
        code: 'entity_attachment_owner_scope_rejected',
        message_fa:
          'مالک و شرکت ضمیمه فقط از نشست و نشانی موجودیت تعیین میشود؛ ارسال این فیلدها مجاز نیست.',
        details: { fields: owned },
      });
    }
    throw new BadRequestException({
      code: 'unsupported_request_field',
      message_fa: 'پارامترهای ارسالی در قرارداد ضمائم تعریف نشدهاند.',
      details: { fields: keys.sort() },
    });
  }

  private actor(user: AuthContext): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get(':ownerType/:ownerId')
  @RequirePermissions('attachment.view')
  @UseGuards(DomainBoundaryGuard)
  list(
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<EntityAttachmentView> {
    this.rejectQuery(query);
    return this.service.list(this.actor(user), ownerType, ownerId);
  }

  @Post(':ownerType/:ownerId')
  @RequirePermissions('attachment.upload')
  @UseGuards(DomainBoundaryGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @HttpCode(HttpStatus.CREATED)
  upload(
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
    @UploadedFile() file: StoredFile | undefined,
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<EntityAttachmentItem> {
    this.rejectQuery(query);
    // `Record<string, unknown>` در زمان اجرا Object است؛ ValidationPipe سراسری
    // آن را دستنخورده میگذارد تا فیلدهای مالکیت ارسالی کلاینت قابل تشخیص باشند.
    return this.service.upload(this.actor(user), ownerType, ownerId, file, body ?? {}, meta);
  }

  @Get(':ownerType/:ownerId/:attachmentId/url')
  @RequirePermissions('attachment.view')
  @UseGuards(DomainBoundaryGuard)
  url(
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ): Promise<AttachmentUrlView> {
    this.rejectQuery(query);
    return this.service.url(this.actor(user), ownerType, ownerId, attachmentId);
  }
}
