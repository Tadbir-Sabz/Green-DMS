import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsDefined, IsUUID } from 'class-validator';
import { AuthGuard } from '../../identity-rbac/auth.guard';
import { PermissionsGuard } from '../../identity-rbac/permissions.guard';
import { RequirePermissions } from '../../identity-rbac/require-permissions.decorator';
import { IntegrationsQueue } from '../queue/integrations.queue';

export class MoadianInvoiceDto {
  @IsDefined()
  @IsUUID('4')
  invoice_id: string;
}

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('integrations/moadian')
export class MoadianController {
  constructor(private readonly queue: IntegrationsQueue) {}

  /** ثبت فاکتور در صف پایدار moadian_submission (وضعیت queued + retry واقعی) */
  @Post('invoice')
  @RequirePermissions('integrations.moadian.submit')
  async submitInvoice(@Body() dto: MoadianInvoiceDto) {
    const job = await this.queue.enqueue({ type: 'moadian.invoice', payload: { ...dto } });
    return { ok: true, jobId: job.id, status: job.status };
  }

  @Get('status')
  @RequirePermissions('integrations.moadian.view')
  async status() {
    const jobs = await this.queue.list();
    return { items: jobs.moadian };
  }
}
