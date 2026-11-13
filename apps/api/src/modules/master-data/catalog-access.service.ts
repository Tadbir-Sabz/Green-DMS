import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../../database/database.module";
import { tenantStorage } from "../../database/tenant-context";
import { withTransaction } from "../../common/transaction";
import { permissionMatches } from "../identity-rbac/permissions";

export const catalogTransaction = new AsyncLocalStorage<PoolClient>();

/** Service boundary: never trust a caller-supplied permission array or company. */
@Injectable()
export class CatalogAccess {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async assert(
    companyId: string,
    userId: string,
    required: string,
  ): Promise<string[]> {
    const { rows } = await this.pool.query<{ code: string }>(
      `select distinct rp.permission_code as code from app_user u
       join person p on p.id = u.person_id
       join user_role ur on ur.app_user_id = u.id
       join role r on r.id = ur.role_id and r.company_id = p.company_id
       join role_permission rp on rp.role_id = r.id
       where u.id = $1 and p.company_id = $2 and not u.is_locked
         and u.access_level <> 'none' and (u.locked_until is null or u.locked_until <= now())`,
      [userId, companyId],
    );
    const permissions = rows.map((r) => r.code);
    if (!permissions.some((p) => permissionMatches(p, required))) {
      throw new ForbiddenException({
        code: "catalog_write_forbidden",
        message_fa: "مجوز معتبر برای این عملیات کاتالوگ ندارید.",
      });
    }
    return permissions;
  }

  /**
   * All pool.query based collaborators share this transaction and tenant GUCs.
   *
   * `options.isolation` is additive for TASK-PM-01D-M4: an explicit,
   * server-chosen repeatable-read bulk operation may request it before any
   * query runs. Existing callers keep the historical READ COMMITTED behavior.
   * Timeout options bound a synchronous bulk operation without a queue.
   */
  async write<T>(
    companyId: string,
    userId: string,
    required: string,
    work: () => Promise<T>,
    options?: {
      isolation?: 'repeatable read' | 'read committed';
      statementTimeoutMs?: number;
      lockTimeoutMs?: number;
    },
  ): Promise<T> {
    await this.assert(companyId, userId, required);
    if (catalogTransaction.getStore()) {
      const tenant = tenantStorage.getStore()?.tenant;
      if (tenant?.companyId !== companyId || tenant.userId !== userId) {
        throw new ForbiddenException({
          code: "catalog_context_mismatch",
          message_fa: "تغییر هویت در تراکنش مجاز نیست.",
        });
      }
      return work();
    }
    return withTransaction(this.pool, async (client) => {
      // SET TRANSACTION must be the first statement of the transaction.
      if (options?.isolation === 'repeatable read') {
        await client.query('set transaction isolation level repeatable read');
      } else if (options?.isolation === 'read committed') {
        await client.query('set transaction isolation level read committed');
      }
      if (options?.statementTimeoutMs != null) {
        await client.query('select set_config($1, $2, true)', [
          'statement_timeout',
          String(Math.max(1, Math.floor(options.statementTimeoutMs))),
        ]);
      }
      if (options?.lockTimeoutMs != null) {
        await client.query('select set_config($1, $2, true)', [
          'lock_timeout',
          String(Math.max(1, Math.floor(options.lockTimeoutMs))),
        ]);
      }
      await client.query(
        `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
        [companyId, userId],
      );
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`catalog:${companyId}`],
      );
      return tenantStorage.run({ client, tenant: { companyId, userId } }, () =>
        catalogTransaction.run(client, async () => {
          await this.assert(companyId, userId, required);
          return work();
        }),
      );
    });
  }
}
