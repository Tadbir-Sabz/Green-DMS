import { Inject, Injectable } from '@nestjs/common';
import { TRACKING_REPOSITORY } from './tracking.tokens';
import type { TrackingRepository } from './tracking.repository';
import { TrackingGateway } from './tracking.gateway';
import type { TrackingPingDto } from './tracking.dto';

@Injectable()
export class TrackingService {
  constructor(
    @Inject(TRACKING_REPOSITORY) private readonly repo: TrackingRepository,
    private readonly gateway: TrackingGateway,
  ) {}

  async live(companyId: string) {
    return this.repo.live(companyId);
  }

  async ping(companyId: string, userId: string, dto: TrackingPingDto) {
    const res = await this.repo.ping(companyId, userId, dto);
    // انتشار فقط در اتاق شرکتِ نشست — نه اتاق مشترک «live» برای همه شرکت‌ها
    this.gateway.broadcastLocation(companyId, {
      ...dto,
      userId,
      at: new Date().toISOString(),
    });
    return res;
  }
}
