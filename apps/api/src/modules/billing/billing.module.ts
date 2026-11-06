import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { BILLING_REPOSITORY, BILLING_SERVICE } from './tokens';

/** ماژول صورتحسابِ اشتراک (ledger، فقط خواندن). بدونِ درگاهِ پرداخت/اشتراکِ پولی. */
@Module({
  imports: [IdentityRbacModule],
  controllers: [BillingController],
  providers: [
    BillingRepository,
    { provide: BILLING_REPOSITORY, useExisting: BillingRepository },
    BillingService,
    { provide: BILLING_SERVICE, useExisting: BillingService },
  ],
  exports: [BILLING_SERVICE],
})
export class BillingModule {}
