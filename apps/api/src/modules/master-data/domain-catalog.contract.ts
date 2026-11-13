import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { isUUID } from "class-validator";

/**
 * TASK-PM-01B: a narrow technical integration contract, NOT a domain registry.
 *
 * Whole-repository inspection found no proven authoritative operational
 * product-catalog domain identity, lifecycle, actor assignment or management
 * authorization. `pricing_domain` is a pricing-policy scope and approval
 * `domain_id` columns are untyped UUIDs; neither is reused here.
 *
 * No provider is registered in this task. Every domain-aware operation therefore
 * fails closed. A future owner-approved authority can be bound to
 * OPERATIONAL_DOMAIN_AUTHORITY without changing central product identity.
 */

export const OPERATIONAL_DOMAIN_AUTHORITY = Symbol(
  "OPERATIONAL_DOMAIN_AUTHORITY",
);

export const DOMAIN_CATALOG_DECISION_DOCUMENT =
  "docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md";
export const DOMAIN_CATALOG_DECISION_DOCUMENT_URL =
  "https://github.com/Tadbir-Sabz/Green-DMS/blob/arena/be5eaff3-green-dms/docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md";

export const DOMAIN_OWNER_DECISIONS = [
  { id: "PM-B1", title: "Domain identifier and ownership" },
  { id: "PM-B2", title: "Domain lifecycle and enabled/disabled semantics" },
  { id: "PM-B3", title: "Domain listing and search permissions" },
  { id: "PM-B4", title: "Central versus domain-level management authority" },
  {
    id: "PM-B5",
    title: "Product membership creation, removal, and deactivation",
  },
  { id: "PM-B6", title: "Visibility of products not yet registered" },
  {
    id: "PM-B7",
    title: "Historical membership retention when a domain is retired",
  },
  { id: "PM-B8", title: "Cross-domain product detail and history visibility" },
] as const;

export const DOMAIN_TECHNICAL_CONTRACT = [
  "stable company-scoped identity and lifecycle",
  "server-side actor-to-domain authorization resolution",
  "domain list/search and resolve APIs with approved explicit permissions",
  "membership state, transition and immutable-history semantics",
  "privacy rules for absent products and cross-domain history",
  "same-company FKs, uniqueness, indexes, RLS and additive migration rollback",
] as const;

/** Provider-owned descriptor. Its metadata vocabulary is not invented here. */
export interface OperationalDomainDescriptor {
  id: string;
  company_id: string;
  label: string;
  metadata: Readonly<Record<string, unknown>>;
}

/**
 * Technical capability names, not IAM permission codes. An approved provider
 * resolves them against its own owner-approved authorization source.
 */
export type DomainCatalogAction =
  | "list_domains"
  | "resolve_domain"
  | "read_membership"
  | "read_history"
  | "manage_membership";

export interface OperationalDomainAuthority {
  readonly source: string;
  listDomains(input: {
    companyId: string;
    userId: string;
    query?: string;
  }): Promise<readonly OperationalDomainDescriptor[]>;
  resolveDomain(input: {
    companyId: string;
    userId: string;
    domainId: string;
    action: DomainCatalogAction;
  }): Promise<OperationalDomainDescriptor | null>;
  authorize(input: {
    companyId: string;
    userId: string;
    domainId: string;
    action: DomainCatalogAction;
  }): Promise<boolean>;
}

export interface DomainCatalogContractStatus {
  /** Product-domain workflow readiness. Always false until owner-approved persistence exists. */
  available: boolean;
  authority_registered: boolean;
  code: string;
  message_fa: string;
  decision_document: string;
  decision_document_url: string;
  owner_decisions: readonly { id: string; title: string }[];
  technical_contract: readonly string[];
  source?: string;
}

export const DOMAIN_IDENTITY_UNRESOLVED =
  "domain_identity_unresolved" as const;
export const DOMAIN_CATALOG_NOT_IMPLEMENTED =
  "domain_catalog_not_implemented" as const;

@Injectable()
export class DomainCatalogGate {
  constructor(
    @Optional()
    @Inject(OPERATIONAL_DOMAIN_AUTHORITY)
    private readonly authority?: OperationalDomainAuthority,
  ) {}

  status(): DomainCatalogContractStatus {
    const authorityRegistered = Boolean(this.authority);
    return {
      available: false,
      authority_registered: authorityRegistered,
      code: authorityRegistered
        ? DOMAIN_CATALOG_NOT_IMPLEMENTED
        : DOMAIN_IDENTITY_UNRESOLVED,
      message_fa:
        "هویت دامنه عملیاتی و مرز اختیار آن تعریف نشده است. دامنه قیمتگذاری جایگزین دامنه کاتالوگ نیست. فعال بودن مرکزی به معنی عرضه در همه دامنهها نیست.",
      decision_document: DOMAIN_CATALOG_DECISION_DOCUMENT,
      decision_document_url: DOMAIN_CATALOG_DECISION_DOCUMENT_URL,
      owner_decisions: DOMAIN_OWNER_DECISIONS,
      technical_contract: DOMAIN_TECHNICAL_CONTRACT,
      ...(this.authority ? { source: this.authority.source } : {}),
    };
  }

  /** No authority is bound: read and write domain workflows both fail closed. */
  requireAuthority(): OperationalDomainAuthority {
    if (!this.authority) throw this.unavailable("domain_contract");
    return this.authority;
  }

  /**
   * Domain context is mandatory and must be a syntactically valid UUID. It is
   * never treated as proof of domain identity, ownership or actor authorization.
   */
  requireDomainContext(domainId?: string): string {
    if (!domainId || !isUUID(domainId, "4")) {
      throw new BadRequestException({
        code: "domain_context_required",
        message_fa:
          "زمینه دامنه معتبری ارسال نشده است؛ دسترسی بدون دامنه مجاز نیست.",
        decision_document: DOMAIN_CATALOG_DECISION_DOCUMENT,
      });
    }
    return domainId;
  }

  private requireIdentity(companyId: string, userId: string): void {
    if (!isUUID(companyId, "4") || !isUUID(userId, "4")) {
      throw new BadRequestException({
        code: "domain_actor_context_invalid",
        message_fa: "زمینه کاربر یا شرکت معتبر نیست؛ درخواست دامنه رد شد.",
      });
    }
  }

  /** Server-side resolve + authorize; a path UUID alone never grants access. */
  async requireAuthorizedDomain(input: {
    companyId: string;
    userId: string;
    domainId?: string;
    action: Exclude<DomainCatalogAction, "list_domains">;
  }): Promise<OperationalDomainDescriptor> {
    const domainId = this.requireDomainContext(input.domainId);
    const authority = this.requireAuthority();
    this.requireIdentity(input.companyId, input.userId);
    const resolved = await authority.resolveDomain({
      companyId: input.companyId,
      userId: input.userId,
      domainId,
      action: input.action,
    });
    if (!resolved) {
      throw new NotFoundException({
        code: "domain_not_found",
        message_fa: "دامنه موردنظر برای این کاربر قابل دسترسی نیست.",
      });
    }
    if (
      resolved.id !== domainId ||
      resolved.company_id !== input.companyId
    ) {
      throw new ForbiddenException({
        code: "domain_company_mismatch",
        message_fa: "دامنه درخواستی متعلق به شرکت جاری نیست.",
      });
    }
    const allowed = await authority.authorize({
      companyId: input.companyId,
      userId: input.userId,
      domainId,
      action: input.action,
    });
    if (!allowed) {
      throw new ForbiddenException({
        code: "domain_access_forbidden",
        message_fa: "دسترسی به داده این دامنه برای کاربر جاری مجاز نیست.",
      });
    }
    return resolved;
  }

  /** List only same-company, provider-authorized domains; no cross-company rows. */
  async listAuthorizedDomains(input: {
    companyId: string;
    userId: string;
    query?: string;
  }): Promise<readonly OperationalDomainDescriptor[]> {
    const authority = this.requireAuthority();
    this.requireIdentity(input.companyId, input.userId);
    const query = input.query?.trim();
    if (query && query.length > 100) {
      throw new BadRequestException({
        code: "domain_search_invalid",
        message_fa: "عبارت جستوجوی دامنه نامعتبر است.",
      });
    }
    const candidates = await authority.listDomains({
      companyId: input.companyId,
      userId: input.userId,
      query,
    });
    const visible: OperationalDomainDescriptor[] = [];
    for (const candidate of candidates) {
      if (
        candidate.company_id !== input.companyId ||
        !isUUID(candidate.id, "4")
      )
        continue;
      const allowed = await authority.authorize({
        companyId: input.companyId,
        userId: input.userId,
        domainId: candidate.id,
        action: "list_domains",
      });
      if (allowed) visible.push(candidate);
    }
    return visible;
  }

  unavailable(operation: string): ServiceUnavailableException {
    const status = this.status();
    return new ServiceUnavailableException({
      ...status,
      operation,
      message_fa:
        "اتصال کاتالوگ به دامنه عملیاتی تا تصمیم مالک و پیادهسازی قرارداد معتبر غیرفعال است. هیچ عضویت یا داده دامنه ساختگی ارائه نمیشود.",
    });
  }

  /** No membership store is implemented; an approved provider alone is insufficient. */
  blocked(operation: string): never {
    throw this.unavailable(operation);
  }
}
