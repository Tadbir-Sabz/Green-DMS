import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { ToursController, VisitsController } from './tours.controller';
import { ToursRepository } from './tours.repository';
import { ToursService, VisitsService } from './tours.service';
import {
  TOURS_REPOSITORY,
  TOURS_SERVICE,
  VISITS_REPOSITORY,
  VISITS_SERVICE,
} from './tokens';

/**
 * ماژول ۵ — تور و بازدید. پیاده‌شده: CRUD تور، تسویه تور، و بازدید با check-in/out
 * مختصات‌دار (ضدتقلب GPS). فروش تلفنی و پورسانت در لایهٔ داده (مهاجرت 0011) حاضرند.
 * یک ToursRepository مشترک پشت هر دو سرویس تور و بازدید است.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [ToursController, VisitsController],
  providers: [
    ToursRepository,
    { provide: TOURS_REPOSITORY, useExisting: ToursRepository },
    { provide: VISITS_REPOSITORY, useExisting: ToursRepository },
    ToursService,
    { provide: TOURS_SERVICE, useExisting: ToursService },
    VisitsService,
    { provide: VISITS_SERVICE, useExisting: VisitsService },
  ],
  exports: [TOURS_SERVICE],
})
export class ToursModule {}
