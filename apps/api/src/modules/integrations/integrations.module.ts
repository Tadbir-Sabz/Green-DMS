import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { IntegrationsQueue } from './queue/integrations.queue';
import { MoadianController } from './moadian/moadian.controller';
import { PspController, PspWebhookController } from './psp/psp.controller';
import { IntegrationsStatusController } from './integrations-status.controller';
import { IntegrationsStatusRepository } from './integrations-status.repository';
import { IntegrationsStatusService } from './integrations-status.service';
import {
  INTEGRATIONS_STATUS_REPOSITORY,
  INTEGRATIONS_STATUS_SERVICE,
} from './integrations-status.tokens';

/**
 * ماژول یکپارچه‌سازی‌ها — ضمیمه D.
 * پیاده‌شده: وضعیت سرویس‌های بیرونی (GET /integrations) و آزمون اتصال
 * (POST /integrations/{key}/test)، صف پایدار مؤدیان/پرداخت، ارسال فاکتور مؤدیان،
 * شارژ و وب‌هوک درگاه. مسیر info اسکلتِ پیشین با endpoint واقعی وضعیت جایگزین شد.
 */
@Module({
  imports: [IdentityRbacModule],
  // PspWebhookController جدا از PspController است تا guard سطح کلاس روی آن نباشد؛
  // جای آن اعتبارسنجی HMAC روی بدنهٔ خام قرار دارد
  controllers: [
    IntegrationsStatusController,
    MoadianController,
    PspController,
    PspWebhookController,
  ],
  providers: [
    IntegrationsQueue,
    IntegrationsStatusRepository,
    { provide: INTEGRATIONS_STATUS_REPOSITORY, useExisting: IntegrationsStatusRepository },
    IntegrationsStatusService,
    { provide: INTEGRATIONS_STATUS_SERVICE, useExisting: IntegrationsStatusService },
  ],
  exports: [IntegrationsQueue],
})
export class IntegrationsModule {}
