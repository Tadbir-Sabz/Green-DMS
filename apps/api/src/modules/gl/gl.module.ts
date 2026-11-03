import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { GlRepository } from './gl.repository';
import { GlService } from './gl.service';
import { GlController } from './gl.controller';
import { GL_REPOSITORY, GL_SERVICE } from './tokens';

/**
 * ماژول دفتر کل (۹) — کدینگ حساب‌ها، دوره‌های مالی، اسناد حسابداری و تراز
 * آزمایشی روی جداول مهاجرت 0018. GlRepository خواندن/نوشتن و GlService منطق و
 * نگاشت خطا را دارد؛ هر دو PG_POOL و DOC_NUMBER_SERVICE سراسری را تزریق می‌گیرند.
 * یکپارچگی سند (توازن، بازهٔ دوره، قفل پس از صدور) توسط تریگرهای خودِ
 * پایگاه‌داده تضمین می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [GlController],
  providers: [
    GlRepository,
    { provide: GL_REPOSITORY, useExisting: GlRepository },
    GlService,
    { provide: GL_SERVICE, useExisting: GlService },
  ],
})
export class GlModule {}
