import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { RoutingController } from './routing.controller';
import { RoutingRepository } from './routing.repository';
import { RoutingService } from './routing.service';
import { ROUTING_REPOSITORY, ROUTING_SERVICE } from './tokens';

/**
 * ماژول بهینه‌سازی مسیر (TSP) — مختصاتِ مشتریان از PostGIS (customer.geo) و
 * الگوریسمِ خالصِ solveRoute. IdentityRbacModule برای AuthGuard/PermissionsGuard
 * و @CurrentUser وارد می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [RoutingController],
  providers: [
    RoutingRepository,
    { provide: ROUTING_REPOSITORY, useExisting: RoutingRepository },
    RoutingService,
    { provide: ROUTING_SERVICE, useExisting: RoutingService },
  ],
  exports: [ROUTING_SERVICE],
})
export class RoutingModule {}
