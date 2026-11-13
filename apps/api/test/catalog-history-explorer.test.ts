import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { TenantAwarePool } from "../src/database/tenant-pool";
import { CatalogAccess } from "../src/modules/master-data/catalog-access.service";
import {
  CatalogFoundationController,
  CatalogFoundationService,
  CENTRAL_CATALOG_HISTORY_ENTITY_TYPES,
  type CatalogHistoryQueryDto,
} from "../src/modules/master-data/catalog-foundation.controller";
import { DomainCatalogGate } from "../src/modules/master-data/domain-catalog.contract";
import { PERMISSIONS_KEY } from "../src/modules/identity-rbac/require-permissions.decorator";
import type { AuthContext } from "../src/modules/identity-rbac/auth-context.decorator";

const company = "00000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000002";
const productId = "00000000-0000-4000-8000-000000000003";
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const actor: AuthContext = {
  userId: user,
  sessionId: "session",
  companyId: company,
  username: "auditor",
  roles: [],
  permissions: [],
};

type QueryCall = { sql: string; values: readonly unknown[] | undefined };

function fixture(permissions = ["master.product.view"], historyRows: unknown[] = []) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("select distinct rp"))
      return { rows: permissions.map((code) => ({ code })) };
    if (sql.includes("from product_catalog_history"))
      return { rows: historyRows };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const inner = {
    query,
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  const pool = new TenantAwarePool(inner) as unknown as Pool;
  const service = new CatalogFoundationService(
    pool,
    new CatalogAccess(pool),
    new DomainCatalogGate(),
  );
  return { service, calls, query, inner };
}

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(100 - index),
    product_id: null,
    entity_type: "product_family",
    entity_id: null,
    action: "UPDATE",
    actor_user_id: user,
    at: "2026-11-07T00:00:00Z",
    before_data: null,
    after_data: { name: `خانواده ${index}` },
  }));
}

const expectBadRequest = async (
  promise: Promise<unknown>,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    status: 400,
    response: { code },
  });
};

describe("TASK-PM-01D company-wide central catalog history (DB-free)", () => {
  it("queries a company-scoped, central-only keyset page and never creates domain behavior", async () => {
    const f = fixture(["master.product.view"], rows(3));
    const page = await f.service.catalogHistory(actor, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBe("99");

    const historyCalls = f.calls.filter((c) =>
      c.sql.includes("from product_catalog_history"),
    );
    expect(historyCalls).toHaveLength(1);
    const call = historyCalls[0];
    expect(call.sql).toContain("company_id = $1");
    expect(call.sql).toContain("entity_type = any($2::text[])");
    expect(call.sql).toContain("order by id desc");
    expect(call.sql).toContain("limit $6");
    expect(call.values?.[0]).toBe(company);
    expect(call.values?.[1]).toEqual([...CENTRAL_CATALOG_HISTORY_ENTITY_TYPES]);
    expect(call.values?.[2]).toBeNull();
    expect(call.values?.[3]).toBeNull();
    expect(call.values?.[4]).toBeNull();
    expect(call.values?.[5]).toBe(3);
    expect(CENTRAL_CATALOG_HISTORY_ENTITY_TYPES).not.toContain("domain_membership");
    expect(f.calls.some((c) => /operational_domain|domain_membership/i.test(c.sql))).toBe(false);
  });

  it("passes entity, product, cursor and bounded limit filters as SQL parameters", async () => {
    const f = fixture();
    await f.service.catalogHistory(actor, {
      entity_type: "product_family",
      product_id: productId,
      before: "900",
      limit: 1000,
    } as CatalogHistoryQueryDto);
    const call = f.calls.find((c) => c.sql.includes("from product_catalog_history"));
    expect(call?.values?.[2]).toBe("product_family");
    expect(call?.values?.[3]).toBe(productId);
    expect(call?.values?.[4]).toBe("900");
    expect(call?.values?.[5]).toBe(101);
    expect(call?.sql).toContain("product_id = $4::uuid");
  });

  it("rejects malformed cursor, non-central entity types and invalid product IDs", async () => {
    const f = fixture();
    await expectBadRequest(
      f.service.catalogHistory(actor, {
        before: "not-a-cursor",
        limit: 30,
      }),
      "invalid_cursor",
    );
    await expectBadRequest(
      f.service.catalogHistory(actor, {
        entity_type: "domain_membership",
        limit: 30,
      } as never),
      "invalid_entity_type",
    );
    await expectBadRequest(
      f.service.catalogHistory(actor, {
        product_id: "not-a-uuid",
        limit: 30,
      } as never),
      "invalid_id",
    );
    expect(f.calls.some((c) => c.sql.includes("from product_catalog_history"))).toBe(false);
  });

  it("revalidates the existing view permission from the database before reading history", async () => {
    const f = fixture([]);
    await expect(f.service.catalogHistory(actor, { limit: 30 })).rejects.toMatchObject(
      {
        status: 403,
        response: { code: "catalog_write_forbidden" },
      },
    );
    expect(f.calls.some((c) => c.sql.includes("from product_catalog_history"))).toBe(false);
    expect(f.query).toHaveBeenCalled();
  });

  it("keeps the controller on the existing view permission and the provider unregistered", () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        CatalogFoundationController.prototype.catalogHistory,
      ),
    ).toEqual(["master.product.view"]);
    const moduleSource = readFileSync(
      path.join(API_ROOT, "src/modules/master-data/master-data.module.ts"),
      "utf8",
    );
    expect(moduleSource).toContain("DomainCatalogGate");
    expect(moduleSource).not.toContain("provide: OPERATIONAL_DOMAIN_AUTHORITY");
    expect(moduleSource).not.toContain("OPERATIONAL_DOMAIN_AUTHORITY");
  });
});
