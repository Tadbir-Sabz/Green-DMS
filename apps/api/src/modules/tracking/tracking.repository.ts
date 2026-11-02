import { BadRequestException, Injectable } from '@nestjs/common';
import { pg } from '../../db/pg';

@Injectable()
export class TrackingRepository {
  async live(companyId: string) {
    const { rows } = await pg.query(
      `select * from v_live_locations where company_id = $1 order by sampled_at desc`,
      [companyId],
    );
    return rows;
  }

  /**
   * ثبت نمونه موقعیت فروشنده/موزع — جدول location_sample ستون company/user ندارد
   * (migrations/0012:43)؛ کارمند از روی person مشترک user↔staff پیدا می‌شود و
   * دامنه شرکت از شعبه او گرفته می‌شود. سرعت ورودی کیلومتر/ساعت است و در دdl m/s است.
   */
  async ping(companyId: string, userId: string, body: any) {
    const lat = body?.lat ?? body?.latitude;
    const lng = body?.lng ?? body?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException({
        code: 'invalid_coordinates',
        message_fa: 'مختصات جغرافیایی (lat و lng) الزامی و عددی است.',
      });
    }
    const speedKph = Number(body?.speed_kph ?? body?.speed ?? 0);

    const { rows } = await pg.query(
      `insert into location_sample
          (staff_id, session_id, tour_id, geo, accuracy_m, speed_mps, heading_deg,
           battery_pct, is_mocked, provider, recorded_at)
       select s.id, $3::uuid, $4::uuid,
              ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography,
              $5::numeric, $6::numeric, $7::numeric, $8::smallint, $9::boolean,
              coalesce($10, 'gps'), coalesce($11::timestamptz, now())
         from staff s
         join app_user u on u.person_id = s.person_id
         join branch b on b.id = s.branch_id
        where u.id = $12 and b.company_id = $13
       returning id, staff_id, recorded_at, accuracy_m, speed_mps, heading_deg,
                 is_mocked, provider
    `,
      [
        lat,
        lng,
        body?.session_id ?? null,
        body?.tour_id ?? null,
        body?.accuracy_m ?? null,
        Number.isFinite(speedKph) ? speedKph / 3.6 : 0,
        body?.heading_deg ?? null,
        body?.battery_pct ?? null,
        body?.is_mocked === true,
        ['gps', 'network', 'fused'].includes(body?.provider) ? body.provider : 'gps',
        body?.recorded_at ?? null,
        userId,
        companyId,
      ],
    );
    return rows[0] ?? null;
  }
}
