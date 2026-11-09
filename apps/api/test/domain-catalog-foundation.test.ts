import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { TenantAwarePool } from "../src/database/tenant-pool";
import { CatalogAccess } from "../src/modules/master-data/catalog-access.service";
import { CatalogFoundationController, CatalogFoundationService } from "../src/modules/master-data/catalog-foundation.controller";
import {
  DomainCatalogGate,
  DOMAIN_CATALOG_DECISION_DOCUMENT,
  DOMAIN_CATALOG_NOT_IMPLEMENTED,
  DOMAIN_IDENTITY_UNRESOLVED,
  type OperationalDomainAuthority,
  type OperationalDomainDescriptor,
} from "../src/modules/master-data/domain-catalog.contract";
import { PERMISSIONS_KEY } from "../src/modules/identity-rbac/require-permissions.decorator";
import type { AuthContext } from "../src/modules/identity-rbac/auth-context.decorator";

const company = "00000000-0000-4000-8000-000000000001";
const otherCompany = "00000000-0000-4000-8000-000000000099";
const user = "00000000-0000-4000-8000-000000000002";
const domainId = "00000000-0000-4000-8000-000000000011";
const otherDomainId = "00000000-0000-4000-8000-000000000012";
const foreignDomainId = "00000000-0000-4000-8000-000000000013";
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const actor: AuthContext = {
  userId: user,
  sessionId: "session",
  companyId: company,
  username: "operator",
  roles: [],
  permissions: [],
};

function fixture(permissions = ["master.product.*"]) {
  const log: string[] = [];
  const query = vi.fn(async (sql: string) => {
    log.push(sql);
    return {
      rows: sql.includes("select distinct rp")
        ? permissions.map((code) => ({ code }))
        : [],
    };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const inner = {
    query,
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  const pool = new TenantAwarePool(inner) as unknown as Pool;
  return { pool, access: new CatalogAccess(pool), log, release, inner, query };
}

function makeService(authority?: OperationalDomainAuthority) {
  const f = fixture();
  const gate = new DomainCatalogGate(authority);
  const service = new CatalogFoundationService(f.pool, f.access, gate);
  return { ...f, gate, service };
}

function descriptor(overrides: Partial<OperationalDomainDescriptor> = {}): OperationalDomainDescriptor {
  return {
    id: domainId,
    company_id: company,
    label: "approved provider descriptor",
    metadata: {},
    ...overrides,
  };
}

function provider(overrides: Partial<OperationalDomainAuthority> = {}) {
  return {
    source: "unit-test-authority",
    listDomains: vi.fn(async () => [descriptor()]),
    resolveDomain: vi.fn(async () => descriptor()),
    authorize: vi.fn(async () => true),
    ...overrides,
  };
}

const expectStatus = async (promise: Promise<unknown>, status: number, code: string) => {
  await expect(promise).rejects.toMatchObject({ status, response: { code } });
};

describe("TASK-PM-01B domain-catalog fail-closed foundation (DB-free)", () => {
  it("reports no authority, all eight owner decisions and no membership data", () => {
    const { service } = makeService();
    const status = service.domainContract();
    expect(status).toMatchObject({
      available: false,
      authority_registered: false,
      code: DOMAIN_IDENTITY_UNRESOLVED,
      decision_document: DOMAIN_CATALOG_DECISION_DOCUMENT,
    });
    expect(status.owner_decisions.map((d) => d.id)).toEqual([
      "PM-B1", "PM-B2", "PM-B3", "PM-B4", "PM-B5", "PM-B6", "PM-B7", "PM-B8",
    ]);
    expect(status.technical_contract.length).toBeGreaterThanOrEqual(6);
    expect(status).not.toHaveProperty("items");
    expect(status).not.toHaveProperty("memberships");
    expect(status).not.toHaveProperty("domains");
  });

  it("does not register a competing domain authority in the production module", () => {
    const source = readFileSync(
      path.join(API_ROOT, "src/modules/master-data/master-data.module.ts"),
      "utf8",
    );
    expect(source).toContain("DomainCatalogGate");
    expect(source).not.toContain("OPERATIONAL_DOMAIN_AUTHORITY");
    expect(source).not.toContain("provide: OPERATIONAL_DOMAIN_AUTHORITY");
  });

  it("fails all domain reads closed without opening a DB transaction", async () => {
    const { service, query, inner } = makeService();
    expect(() => service.domainCatalog()).toThrow();
    await expect(service.domainList(actor)).rejects.toMatchObject({ status: 503 });
    await expect(service.domainProducts(actor, domainId)).rejects.toMatchObject({ status: 503 });
    await expect(service.membership(actor, domainId)).rejects.toMatchObject({ status: 503 });
    await expect(service.membershipHistory(actor, domainId)).rejects.toMatchObject({ status: 503 });
    await expect(service.currentDomain(actor, domainId)).rejects.toMatchObject({ status: 503 });
    expect(query).not.toHaveBeenCalled();
    expect(inner.connect).not.toHaveBeenCalled();
  });

  it("rejects missing and malformed mandatory domain context with 400", async () => {
    const { service, query } = makeService(provider());
    await expectStatus(service.currentDomain(actor), 400, "domain_context_required");
    await expectStatus(service.membership(actor), 400, "domain_context_required");
    await expectStatus(service.membershipHistory(actor, "not-a-uuid"), 400, "domain_context_required");
    await expectStatus(service.domainProducts(actor, "not-a-uuid"), 400, "domain_context_required");
    await expectStatus(service.blockedMembershipWrite(actor, "not-a-uuid", "membership_create"), 400, "domain_context_required");
    expect(query).not.toHaveBeenCalled();
  });

  it("requires server-side resolution and action-specific authorization before any data", async () => {
    const deny = provider({
      resolveDomain: vi.fn(async () => descriptor()),
      authorize: vi.fn(async () => false),
    });
    await expectStatus(
      new DomainCatalogGate(deny).requireAuthorizedDomain({
        companyId: company, userId: user, domainId, action: "read_history",
      }),
      403,
      "domain_access_forbidden",
    );
    expect(deny.resolveDomain).toHaveBeenCalledWith({
      companyId: company, userId: user, domainId, action: "read_history",
    });
    const missing = provider({ resolveDomain: vi.fn(async () => null) });
    await expectStatus(
      new DomainCatalogGate(missing).requireAuthorizedDomain({
        companyId: company, userId: user, domainId, action: "read_membership",
      }),
      404,
      "domain_not_found",
    );
  });

  it("rejects cross-company descriptors and filters unauthorized/foreign domain rows", async () => {
    const foreign = provider({
      resolveDomain: vi.fn(async () => descriptor({ company_id: otherCompany })),
    });
    await expectStatus(
      new DomainCatalogGate(foreign).requireAuthorizedDomain({
        companyId: company, userId: user, domainId, action: "read_membership",
      }),
      403,
      "domain_company_mismatch",
    );
    const own = descriptor();
    const foreignRow = descriptor({ id: foreignDomainId, company_id: otherCompany });
    const unauthorizedRow = descriptor({ id: otherDomainId });
    const scoped = provider({
      listDomains: vi.fn(async () => [own, foreignRow, unauthorizedRow]),
      authorize: vi.fn(async (input: { domainId: string; action: string }) =>
        input.domainId === domainId && input.action === "list_domains",
      ),
    });
    const visible = await new DomainCatalogGate(scoped).listAuthorizedDomains({
      companyId: company, userId: user,
    });
    expect(visible).toEqual([own]);
    expect(scoped.authorize).not.toHaveBeenCalledWith(expect.objectContaining({ domainId: foreignDomainId }));
    expect(scoped.authorize).toHaveBeenCalledWith(expect.objectContaining({ domainId: otherDomainId, action: "list_domains" }));
  });

  it("enforces provider authorization at the service write boundary and rolls back", async () => {
    const authority = provider();
    const { service, log, query, release } = makeService(authority);
    await expect(
      service.blockedMembershipWrite(actor, domainId, "membership_create"),
    ).rejects.toMatchObject({
      status: 503,
      response: { operation: "membership_create", code: DOMAIN_CATALOG_NOT_IMPLEMENTED },
    });
    expect(authority.authorize).toHaveBeenCalledTimes(2);
    expect(authority.authorize).toHaveBeenCalledWith({
      companyId: company, userId: user, domainId, action: "manage_membership",
    });
    expect(log).toContain("rollback");
    expect(log).not.toContain("commit");
    expect(log.some((sql) => /insert|delete|product_domain|domain_membership/i.test(sql))).toBe(false);
    expect(query).toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("denies unauthorized or foreign domain writes before a transaction opens", async () => {
    const denied = provider({ authorize: vi.fn(async () => false) });
    const deniedFixture = makeService(denied);
    await expectStatus(
      deniedFixture.service.blockedMembershipWrite(actor, domainId, "membership_status_change"),
      403,
      "domain_access_forbidden",
    );
    expect(deniedFixture.inner.connect).not.toHaveBeenCalled();
    const foreign = provider({
      resolveDomain: vi.fn(async () => descriptor({ company_id: otherCompany })),
    });
    const foreignFixture = makeService(foreign);
    await expectStatus(
      foreignFixture.service.blockedMembershipWrite(actor, domainId, "membership_removal"),
      403,
      "domain_company_mismatch",
    );
    expect(foreignFixture.inner.connect).not.toHaveBeenCalled();
  });

  it("keeps service write permission enforcement even when a provider exists", async () => {
    const authority = provider();
    const f = fixture([]);
    const service = new CatalogFoundationService(f.pool, f.access, new DomainCatalogGate(authority));
    await expect(
      service.blockedMembershipWrite(actor, domainId, "membership_create"),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.inner.connect).not.toHaveBeenCalled();
    expect(f.log).not.toContain("commit");
  });

  it("keeps all domain endpoints behind existing central RBAC permissions", () => {
    const proto = CatalogFoundationController.prototype;
    const required = (name: keyof CatalogFoundationController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, proto[name]) as string[] | undefined;
    expect(required("contract")).toEqual(["master.product.view"]);
    expect(required("domain")).toEqual(["master.product.view"]);
    expect(required("domains")).toEqual(["master.product.view"]);
    expect(required("currentDomain")).toEqual(["master.product.view"]);
    expect(required("domainProducts")).toEqual(["master.product.view"]);
    expect(required("productMembership")).toEqual(["master.product.view"]);
    expect(required("productMembershipHistory")).toEqual(["master.product.view"]);
    expect(required("addDomainProduct")).toEqual(["master.product.update"]);
    expect(required("changeDomainProduct")).toEqual(["master.product.update"]);
    expect(required("removeDomainProduct")).toEqual(["master.product.update"]);
    const source = readFileSync(
      path.join(API_ROOT, "src/modules/master-data/catalog-foundation.controller.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/@RequirePermissions\("[^"]*domain[^"]*"\)/);
  });
});
