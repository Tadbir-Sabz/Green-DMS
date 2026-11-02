import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { TrackingController } from './tracking.controller';
import { GeofenceController } from './geofence.controller';
import { GeofenceRepository } from './geofence.repository';
import { GeofenceService } from './geofence.service';
import { TrackingRepository } from './tracking.repository';
import { TrackingService } from './tracking.service';
import { GEOFENCE_REPOSITORY, GEOFENCE_SERVICE, TRACKING_REPOSITORY, TRACKING_SERVICE } from './tracking.tokens';
import { TrackingGateway } from './tracking.gateway';

@Controller('tracking')
export class TrackingModuleInfoController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'tracking',
      title: 'ردیابی میدانی',
      resources: ['field-sessions', 'location-samples', 'geofences', 'route-plans'],
      status: 'implemented',
    };
  }
}

@Module({
  imports: [IdentityRbacModule],
  controllers: [TrackingModuleInfoController, TrackingController, GeofenceController],
  providers: [
    TrackingGateway,
    { provide: TRACKING_REPOSITORY, useClass: TrackingRepository },
    { provide: TRACKING_SERVICE, useClass: TrackingService },
    GeofenceRepository,
    { provide: GEOFENCE_REPOSITORY, useExisting: GeofenceRepository },
    GeofenceService,
    { provide: GEOFENCE_SERVICE, useExisting: GeofenceService },
  ],
  exports: [TrackingGateway],
})
export class TrackingModule {}
