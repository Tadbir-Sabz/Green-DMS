import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { IsDefined, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthGuard } from '../../identity-rbac/auth.guard';
import { PermissionsGuard } from '../../identity-rbac/permissions.guard';
import { RequirePermissions } from '../../identity-rbac/require-permissions.decorator';
import { PG_POOL } from '../../../database/database.module';
import { IntegrationsQueue } from '../queue/integrations.queue';

export class PspChargeDto {
  @IsDefined()
  @IsUUID('4')
  branch_id: string;

  @IsDefined()
  @IsString()
  @MaxLength(64)
  terminal_id: string;

  @IsDefined()
  @IsString()
  @MaxLength(32)
  psp: string;

  /** مبلغ به ریال — قرارداد numeric رشته‌ای است */
  @IsDefined()
  @IsNumberString()
  amount: string;

  @IsOptional()
  @IsUUID('4')
  invoice_id?: string;
}

/**
 * بدنهٔ رویداد درگاه — امضا اعتبارسنجی می‌شود؛ فیلدهای اضافی هر درگاه در
 * مقایسهٔ تراکنش به کار نمی‌روند ولی برای ممیزی در لاگ ثبت می‌شوند.
 */
export class PspWebhookDto {
  @IsDefined()
  @IsString()
  @MaxLength(128)
  event_id: string;

  @IsDefined()
  @IsString()
  @MaxLength(32)
  psp: string;

  @IsDefined()
  @IsIn(['success', 'failed'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  rrn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  trace_no?: string;

  @IsOptional()
  @IsNumberString()
  amount?: string;
}

/** /integrations/psp/pay و /integrations/psp/reconcile — نیازمند مجوز */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('integrations/psp')
export class PspController {
  constructor(private readonly queue: IntegrationsQueue) {}

  @Post('pay')
  @RequirePermissions('integrations.psp.charge')
  async charge(@Body() dto: PspChargeDto) {
    const job = await this.queue.enqueue({ type: 'psp.charge', payload: { ...dto } });
    return { ok: true, status: job.status, jobId: job.id };
  }

  @Get('reconcile')
  @RequirePermissions('integrations.psp.reconcile')
  async reconcile() {
    const jobs = await this.queue.list();
    const pending = jobs.psp.filter((row) => {
      const status = (row as { status?: string }).status;
      return status === 'queued' || status === 'retrying';
    }).length;
    return { reconciled: 0, pending };
  }
}

/**
 * POST /integrations/psp/webhook — دروازه بدون نشست فراخوانی می‌شود؛ جای
 * AuthGuard اعتبارسنجی امضا گذاشته شده است (فاز B):
 *
 * - بدون PSP_WEBHOOK_SECRET هیچ رویدادی پذیرفته نمی‌شود (503) تا در توسعه هم
 *   نتوان رویداد جعلی ثبت کرد؛
 * - هدر x-psp-signature باید برابر HMAC-SHA256 روی بدنهٔ خام با همان کلید باشد؛
 *   مقایسه با timingSafeEqual انجام می‌شود تا از نشت زمانی جلوگیری شود؛
 * - رویدادِ امضاشده، وضعیت تراکنش همان rrn را به‌روزرسانی می‌کند (قرارداد
 *   uq(psp, terminal_id, rrn) تضمین یکتایی تراکنش است).
 */
@Controller('integrations/psp')
export class PspWebhookController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() dto: PspWebhookDto,
  ): Promise<{ ok: true; received: true; applied: number }> {
    const secret = process.env.PSP_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'webhook_not_configured',
        message_fa: 'کلید امضای وب‌هوک پرداخت تنظیم نشده است.',
      });
    }

    const header = req.headers['x-psp-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) {
      throw new UnauthorizedException({
        code: 'invalid_signature',
        message_fa: 'امضای رویداد درگاه ارسال نشده است.',
      });
    }

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const provided = signature.trim().toLowerCase();
    const valid =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));

    if (!valid) {
      throw new UnauthorizedException({
        code: 'invalid_signature',
        message_fa: 'امضای رویداد درگاه معتبر نیست.',
      });
    }

    let applied = 0;
    if (dto.rrn) {
      // رویداد تأییدشده → وضعیت تراکنش همان rrn
      const result = await this.pool.query(
        `update psp_transaction
            set status = $3, last_error = null, next_retry_at = null
          where psp = $1 and rrn = $2 and status in ('queued', 'sending', 'retrying', 'success')`,
        [dto.psp, dto.rrn, dto.status],
      );
      applied = result.rowCount ?? 0;
    }
    return { ok: true, received: true, applied };
  }
}
