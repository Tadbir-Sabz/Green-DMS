import { Controller, Get } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';

/** Finance — حسابداری فروش/خرید/انبار و خزانه‌داری (ماژول‌های ۷ تا ۱۰) */
@Controller('finance')
export class FinanceController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'finance',
      title: 'مالی (فروش، خرید، انبار، خزانه)',
      resources: [
        'customer-ledger',
        'supplier-ledger',
        'inventory-valuation',
        'treasury',
        'receipts',
        'payments',
        'journal-entries',
        'gl-accounts',
        'ar-aging',
        'ap-aging',
      ],
      status: 'scaffold',
    };
  }
}

@Module({ controllers: [FinanceController] })
export class FinanceModule {}
