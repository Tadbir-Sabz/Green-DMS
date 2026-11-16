import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import { withTransaction } from '../../common/transaction';
import type { ListTerritoryCoverageQueryDto, ReassignCustomersDto } from './territory.dto';
import type {
  TerritoryRepository,
  TerritoryConflictRow,
  RouteCoverageRow,
  UnassignedCustomerRow,
} from './territory.repository';
import { TERRITORY_REPOSITORY } from './tokens';

const badRequest = (
  code: string,
  message_fa: string,
  details?: Record<string, unknown>,
): BadRequestException =>
  new BadRequestException({ code, message_fa, ...(details ? { details } : {}) });

export interface TerritoryCoverageView {
  totals: {
    areas: number;
    routes: number;
    customers_total: number;
    customers_assigned: number;
    customers_unassigned: number;
    customers_conflicting: number;
  };
  routes: RouteCoverageRow[];
  unassigned_customers: UnassignedCustomerRow[];
  conflicts: TerritoryConflictRow[];
  conflicts_total: number;
}

/**
 * تکمیلِ پوششِ قلمرو/مسیر (P3-D):
 *  - «پوشش» = چند مشتریِ فعال بدونِ مسیر مانده‌اند و پوششِ به‌تفکیکِ مسیر (مشتری/ویزیتور)؛
 *  - «تشخیصِ تعارض» فقط همان چیزهایی را می‌پوشاند که مدلِ داده پشتیبانشان است
 *    (منطقهٔ مسیر vs منطقهٔ مشتری، مسیرِ غیرفعال، منطقهٔ غیرفعال، ترتیبِ بازدید تکراری)؛
 *  - انتسابِ گروهی با قفلِ ردیفِ مشتری + مسیر انجام می‌شود، منطقهٔ مشتری با منطقهٔ مسیر
 *    هم‌راستا می‌شود، و هر تغییر با «قبل/بعد» در audit_log ثبت می‌شود.
 */
@Injectable()
export class TerritoryService {
  constructor(
    @Inject(TERRITORY_REPOSITORY) private readonly repo: TerritoryRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  async coverage(
    companyId: string,
    query: ListTerritoryCoverageQueryDto,
  ): Promise<TerritoryCoverageView> {
    const [totals, routes, unassigned, conflicts] = await Promise.all([
      this.repo.coverageTotals(companyId, query),
      this.repo.routeCoverage(companyId, query),
      this.repo.unassignedCustomers(companyId, query, 200),
      this.repo.conflicts(companyId, query, 200),
    ]);
    // totals از ریپازیتوری: areas/routes/customers_total/customers_assigned/customers_unassigned
    const conflictingIds = new Set(conflicts.items.map((c) => c.customer_id));
    return {
      totals: { ...totals, customers_conflicting: conflictingIds.size },
      routes,
      unassigned_customers: unassigned,
      conflicts: conflicts.items,
      conflicts_total: conflicts.total,
    };
  }

  /** انتسابِ گروهیِ مشتریان به یک مسیر (یا جداسازی با target_route_id = null) — all-or-nothing */
  async reassign(
    companyId: string,
    dto: ReassignCustomersDto,
    actorUserId: string | null,
  ): Promise<{ updated: number; target_route_id: string | null; unassigned: boolean }> {
    const uniqueIds = [...new Set(dto.customer_ids)];
    return withTransaction(this.pool, async (client) => {
      const target = dto.target_route_id
        ? await this.repo.findTargetRoute(client, companyId, dto.target_route_id)
        : null;
      if (dto.target_route_id) {
        if (!target) {
          throw badRequest('target_route_not_found', 'مسیرِ مقصد در این شرکت یافت نشد.');
        }
        if (!target.is_active) {
          throw badRequest(
            'target_route_inactive',
            'مسیرِ مقصد غیرفعال است؛ انتساب به مسیرِ غیرفعال مجاز نیست.',
          );
        }
      }
      const found = await this.repo.lockCustomers(client, companyId, uniqueIds);
      if (found.length !== uniqueIds.length) {
        const foundIds = new Set(found.map((r) => r.id));
        const missing = uniqueIds.filter((id) => !foundIds.has(id));
        throw badRequest(
          'customer_not_found',
          'برخی مشتریان در این شرکت یافت نشدند؛ هیچ تغییری اعمال نشد.',
          { missing_customer_ids: missing },
        );
      }
      const base = target ? await this.repo.maxVisitSequence(client, target.id) : 0;
      let index = 0;
      for (const customer of found) {
        index += 1;
        const before = {
          route_id: customer.route_id,
          visit_sequence: customer.visit_sequence,
          area_id: customer.area_id,
        };
        const after = target
          ? { route_id: target.id, visit_sequence: base + index, area_id: target.area_id }
          : { route_id: null, visit_sequence: null, area_id: customer.area_id };
        await this.repo.assignCustomer(
          client,
          customer.id,
          target ? { routeId: target.id, areaId: target.area_id, visitSequence: base + index } : null,
        );
        await this.audit.recordRequired(
          {
            companyId,
            actorUserId,
            action: 'update',
            entityType: 'customer',
            entityId: customer.id,
            before,
            after: { ...after, reason: dto.reason.trim() },
          },
          client,
        );
      }
      return { updated: found.length, target_route_id: target?.id ?? null, unassigned: !target };
    });
  }
}
