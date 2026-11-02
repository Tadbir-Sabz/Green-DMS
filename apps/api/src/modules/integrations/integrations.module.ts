import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { IntegrationsQueue } from './queue/integrations.queue';
import { MoadianController } from './moadian/moadian.controller';
import { PspController, PspWebhookController } from './psp/psp.controller';

@Controller('integrations')
export class IntegrationsController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'integrations',
      title: 'یکپارچه‌سازی‌ها',
      resources: ['moadian', 'payment-gateways', 'pos-terminals', 'sms', 'national-id-lookup', 'push'],
      status: 'implemented',
    };
  }
}

@Module({
  imports: [IdentityRbacModule],
  // PspWebhookController جدا از PspController است تا guard سطح کلاس روی آن نباشد؛
  // جای آن اعتبارسنجی HMAC روی بدنهٔ خام قرار دارد
  controllers: [IntegrationsController, MoadianController, PspController, PspWebhookController],
  providers: [IntegrationsQueue],
  exports: [IntegrationsQueue],
})
export class IntegrationsModule {}
