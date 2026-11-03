import { Controller, Get, Module } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { FinanceRepository } from './finance.repository';
import { FinanceWriteRepository } from './finance-write.repository';
import { ArService, ApService, TreasuryService } from './finance.service';
import { ChequeService } from './cheque.service';
import { PaymentService } from './payment.service';
import { ArController, ApController, TreasuryController } from './finance.controller';
import { ChequeController } from './cheque.controller';
import { PaymentController } from './payment.controller';
import {
  AR_REPOSITORY,
  AR_SERVICE,
  AP_REPOSITORY,
  AP_SERVICE,
  TREASURY_REPOSITORY,
  TREASURY_SERVICE,
  TREASURY_WRITE_REPOSITORY,
  CHEQUE_REPOSITORY,
  CHEQUE_SERVICE,
  PAYMENT_REPOSITORY,
  PAYMENT_SERVICE,
} from './tokens';

/** اسکلت /finance — فهرست منابع ماژول مالی (info endpoint خارج از قرارداد پولی) */
@Controller('finance')
export class FinanceController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'finance',
      title: 'مالی (فروش، خرید، انبار، خزانه)',
      resources: [
        'ar-aging',
        'customer-statement',
        'ap-balances',
        'treasury-positions',
        'cheques',
        'payment-receipts',
      ],
      status: 'implemented',
    };
  }
}

/**
 * ماژول مالی (۷ تا ۱۰) — AR/AP/Treasury/Cheques/Payments روی جداول مهاجرت
 * 0013..0015. FinanceRepository مدل‌های خواندنی و FinanceWriteRepository نوشتن
 * چک/رسید را دارد؛ هر دو PG_POOL سراسری را تزریق می‌گیرند.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [
    FinanceController,
    ArController,
    ApController,
    TreasuryController,
    ChequeController,
    PaymentController,
  ],
  providers: [
    FinanceRepository,
    { provide: AR_REPOSITORY, useExisting: FinanceRepository },
    { provide: AP_REPOSITORY, useExisting: FinanceRepository },
    { provide: TREASURY_REPOSITORY, useExisting: FinanceRepository },
    FinanceWriteRepository,
    { provide: CHEQUE_REPOSITORY, useExisting: FinanceWriteRepository },
    { provide: PAYMENT_REPOSITORY, useExisting: FinanceWriteRepository },
    { provide: TREASURY_WRITE_REPOSITORY, useExisting: FinanceWriteRepository },
    ArService,
    { provide: AR_SERVICE, useExisting: ArService },
    ApService,
    { provide: AP_SERVICE, useExisting: ApService },
    TreasuryService,
    { provide: TREASURY_SERVICE, useExisting: TreasuryService },
    ChequeService,
    { provide: CHEQUE_SERVICE, useExisting: ChequeService },
    PaymentService,
    { provide: PAYMENT_SERVICE, useExisting: PaymentService },
  ],
})
export class FinanceModule {}
