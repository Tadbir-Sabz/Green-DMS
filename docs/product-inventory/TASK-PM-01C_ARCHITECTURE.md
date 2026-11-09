# TASK-PM-01C — Operational Domain Architecture

**Status: PROPOSED / OWNER-REVIEWABLE.** PM-B1 through PM-B8 remain **OPEN / NOT APPROVED**. This document contains no approved business policy, no signatory, no domain data, and no executable domain registry. It does not change PR #14's fail-closed implementation.

Baseline verified: PR #14 head `19b7611cb8ce5534709245486e48b4814deb5bd0`; base merge commit `6b4429ba7e55f7e02f407e63f2b2b2e197fad1fa`. PM-01A final implementation `eb23347421d00525e72d57766bf0ef5fc288f9af`. Branch `arena/be5eaff3-green-dms` remains `pr_open`. No merge/deploy/protected-branch/production/shared-DB change is authorized.

> خلاصه فارسی برای مالک: این سند فقط یک «معماری هدف قابلبررسی» ارائه میکند. ستاد مرکزی مالک حاکمیت، سیاستها، نظارت و تصمیمهای صریحاً محفوظ است؛ دامنههای عملیاتی بر منابع واگذارشده خود از جمله انبارها، ناوگان، قیمتگذاری دامنهای، کاربران/مجوزهای دامنهای و موجودی عملیاتی اختیار دارند. هویت جهانی کالا، عضویت کالا در دامنه، فعال/در دسترس بودن محلی و صفات تجاری/عملیاتی دامنهای چهار لایه جدا هستند. وجود یا فعال بودن مرکزی بهمعنی عرضه در همه دامنهها نیست. هیچ جدول، مجوز، شناسه دامنه یا جریان کاری تا تصمیم مالک پیادهسازی نمیشود. بسته تصمیم کامل در `TASK-PM-01C_OWNER_DECISION_PACKAGE.md` است.

## 1. Evidence boundary and status legend

Legend used in every diagram and matrix:

| Marker | Meaning |
|---|---|
| **IMPLEMENTED** | Existing code/database/API/UI on the verified PM-01B SHA. |
| **FOUNDATION** | Existing PM-01B fail-closed technical boundary; no business semantics. |
| **PROPOSED** | Target-state component requiring one or more PM-B decisions; not built. |
| **BLOCKED** | Cannot be implemented or activated until explicit owner approval evidence exists. |
| **UNVERIFIED** | No executable/mapping/visual/independent-review evidence available. |

### Verified implemented baseline

- `product.id` and `product.company_id` remain the sole central SKU/company identity; existing `0046`/`0047` Product Master tables and RLS remain intact.
- PM-01A delivered DB-resolved service write authorization through `CatalogAccess`, shared transactions/tenant GUCs, immutable `0060` catalog history, and connected Persian RTL Product Master screens.
- PM-01B delivered `DomainCatalogGate`, an **unregistered** `OPERATIONAL_DOMAIN_AUTHORITY` symbol, fail-closed read/write endpoints, missing-context 400 handling, OpenAPI/client documentation, a Persian RTL decision/blocked-state page, and DB-free tests.
- `MasterDataModule` registers `DomainCatalogGate` only; it does **not** register `OPERATIONAL_DOMAIN_AUTHORITY`. A static PM-01B test asserts this.
- `AuthContext` contains `userId`, `sessionId`, `companyId`, `username`, `roles`, `permissions`; no domain identity or actor-to-domain assignment exists.
- `0041` provides fail-closed `fn_current_company_id()` and runtime roles; `0047` provides company-level Product Master RLS. No domain-level RLS table/policy exists.
- `pricing_domain` from `0049` is a pricing-policy scope (`channel`/`area`/`branch`); approval `domain_id` columns from `0053` are untyped UUIDs. Neither is authoritative for product-catalog domains.
- No `product_domain_*`, `operational_domain`, `actor_domain_assignment`, domain-scoped permission, migration or workflow exists.

### Explicitly not changed by PM-01C

- No migration or rollback file.
- No `.github` workflow change.
- No code, OpenAPI, generated client, permission seed, RLS policy, grant or DB connection.
- No registry row, domain ID, sample domain, sample product, fabricated owner, signatory or approval record.

## 2. Preserved organizational principles

1. **Central Headquarters:** owns organization-wide governance, policies, oversight and decisions explicitly reserved for central authority. Central ownership of global product identity does **not** imply unrestricted operational control over domain resources.
2. **Operational Domains:** retain delegated autonomy over their own operational resources and activities, including warehouses, vehicles/fleet, domain-specific pricing, domain-level users/permissions, operational inventory and other delegated resources. Integration of those resources into Product Master requires owner-approved mappings; no implicit equivalence is assumed.
3. **Four-layer product model:**
   - L1 global product identity and product master information;
   - L2 product membership in an operational domain;
   - L3 product availability/activation within that domain;
   - L4 domain-specific commercial/operational attributes.
4. **No universal fan-out:** a product may be active in one domain and absent or unavailable in another. No membership row means absent, not implicitly available.
5. **Central lifecycle dominance:** local availability cannot revive a centrally blocked/discontinued/deleted product. Exact transition semantics remain a PM-B5/PM-B2 decision.
6. **Single source of truth:** if PM-B1 approves a dedicated company-scoped `operational_domain` identity, it must be the single authoritative registry. It is not a parallel registry and must not repurpose `pricing_domain`, branch, area, warehouse, company, label or approval UUIDs.
7. **Fail closed:** preserve PM-01B's `available:false`/503 behavior until an approved authority provider, membership persistence, IAM vocabulary, privacy rules and executable tests exist.

## 3. Target-state architecture

### 3.1 Mermaid architecture diagram

Standalone source: `TASK-PM-01C_ARCHITECTURE_DIAGRAM.mmd`.

```mermaid
flowchart TB
  subgraph CHQ["Central Headquarters - implemented governance plus proposed registry authority"]
    CG["Central governance and policy<br/>IMPLEMENTED Product Master governance"]
    PM["Central Product Master<br/>product.id, code, taxonomy, UOM, lifecycle<br/>IMPLEMENTED"]
    HIST["Immutable catalog history 0060<br/>IMPLEMENTED"]
    IAM["IAM roles and permissions<br/>IMPLEMENTED company-level only"]
    REG["Single company-scoped operational_domain registry<br/>PROPOSED after PM-B1"]
    ASSIGN["Actor-to-domain assignment<br/>PROPOSED after PM-B4"]
    AUDIT["Domain membership audit and history<br/>PROPOSED after PM-B7"]
  end

  subgraph FOUND["PM-01B fail-closed foundation - implemented"]
    GATE["DomainCatalogGate<br/>FOUNDATION"]
    STATUS["GET /product-domain-integration<br/>available false plus eight decisions<br/>FOUNDATION"]
    API["Blocked domain API boundaries<br/>400 or 503, no data<br/>FOUNDATION"]
    UI["Persian RTL decision screen<br/>loading, error, empty, permission states<br/>FOUNDATION"]
  end

  subgraph DOMAINS["Operational domains - delegated resources and autonomy"]
    D1["Abstract operational domain<br/>PROPOSED identity, no data"]
    WH["Warehouses and operational inventory<br/>EXISTING resources, integration PROPOSED"]
    FLEET["Vehicles and fleet<br/>EXISTING resources, integration PROPOSED"]
    PRICE["Domain-specific pricing<br/>pricing_domain is NOT the catalog domain"]
    USERS["Domain-level users and permissions<br/>PROPOSED domain scope in IAM"]
    MEM["product_domain_membership<br/>PROPOSED after PM-B4 and PM-B5"]
    AVAIL["Domain availability and activation<br/>PROPOSED after PM-B5"]
    ATTR["Domain commercial and operational attributes<br/>PROPOSED, no downstream execution"]
  end

  subgraph DB["Database boundaries"]
    RLS["Company RLS and dms_app<br/>IMPLEMENTED"]
    DRLS["Domain-aware RLS policies<br/>PROPOSED, UNVERIFIED"]
    PG["Isolated PostgreSQL and PostGIS tests<br/>EXISTING CI, domain tests BLOCKED"]
  end

  CG --> PM
  PM --> HIST
  IAM --> CG
  REG -. "PM-B1 approval" .-> D1
  ASSIGN -. "PM-B3 and PM-B4 approval" .-> USERS
  REG --> GATE
  ASSIGN --> GATE
  GATE --> API
  API --> UI
  STATUS --> UI
  D1 --> MEM
  PM --> MEM
  MEM --> AVAIL
  MEM --> AUDIT
  AVAIL --> ATTR
  D1 --> WH
  D1 --> FLEET
  D1 --> PRICE
  MEM -. "requires domain RLS proof" .-> DRLS
  RLS --> DRLS
  DRLS --> PG

  classDef implemented fill:#e7f7ed,stroke:#1b7f3a,color:#102a18;
  classDef foundation fill:#e8f1ff,stroke:#175cd3,color:#102a43;
  classDef proposed fill:#fff4d6,stroke:#a66b00,stroke-dasharray:5 5,color:#402c00;
  classDef blocked fill:#fde8e8,stroke:#b42318,color:#5a0f0a;
  class CG,PM,HIST,IAM,RLS,PRICE,WH,FLEET implemented;
  class GATE,STATUS,API,UI foundation;
  class REG,ASSIGN,AUDIT,D1,USERS,MEM,AVAIL,ATTR,DRLS proposed;
  class PG blocked;
```

### 3.2 Entity relationship diagram

Standalone source: `TASK-PM-01C_ER_DIAGRAM.mmd`.

```mermaid
erDiagram
  COMPANY ||--o{ CENTRAL_PRODUCT : owns
  COMPANY ||--o{ EXISTING_PRICING_DOMAIN : owns
  COMPANY ||--o{ APP_USER : owns
  APP_USER ||--o{ USER_ROLE : has
  ROLE ||--o{ ROLE_PERMISSION : grants
  PERMISSION ||--o{ ROLE_PERMISSION : used_by
  CENTRAL_PRODUCT ||--o{ PRODUCT_CATALOG_HISTORY : records

  COMPANY ||--o{ PROPOSED_OPERATIONAL_DOMAIN : would_own
  PROPOSED_OPERATIONAL_DOMAIN ||--o{ PROPOSED_DOMAIN_RESOURCE_MAP : explicit_mapping
  PROPOSED_DOMAIN_RESOURCE_MAP }o--|| EXISTING_WAREHOUSE : may_reference
  PROPOSED_DOMAIN_RESOURCE_MAP }o--|| EXISTING_VEHICLE : may_reference
  PROPOSED_DOMAIN_RESOURCE_MAP }o--|| EXISTING_PRICING_DOMAIN : may_reference
  PROPOSED_OPERATIONAL_DOMAIN ||--o{ PROPOSED_ACTOR_DOMAIN_ASSIGNMENT : scoped_actor
  APP_USER ||--o{ PROPOSED_ACTOR_DOMAIN_ASSIGNMENT : assigned
  CENTRAL_PRODUCT ||--o{ PROPOSED_PRODUCT_DOMAIN_MEMBERSHIP : canonical_product
  PROPOSED_OPERATIONAL_DOMAIN ||--o{ PROPOSED_PRODUCT_DOMAIN_MEMBERSHIP : scoped_membership
  PROPOSED_PRODUCT_DOMAIN_MEMBERSHIP ||--o{ PROPOSED_MEMBERSHIP_HISTORY : immutable_events
  PROPOSED_PRODUCT_DOMAIN_MEMBERSHIP ||--o{ PROPOSED_DOMAIN_PRODUCT_ATTRIBUTE : local_attributes
  PROPOSED_MEMBERSHIP_HISTORY ||--o{ PROPOSED_DOMAIN_IDENTITY_SNAPSHOT : preserves_domain_facts

  CENTRAL_PRODUCT {
    uuid id PK
    uuid company_id FK
    string code
    string central_lifecycle
  }
  PROPOSED_OPERATIONAL_DOMAIN {
    uuid id PK
    uuid company_id FK
    string stable_code
    string display_name
    string lifecycle_state
    int row_version
  }
  PROPOSED_ACTOR_DOMAIN_ASSIGNMENT {
    uuid company_id FK
    uuid user_id FK
    uuid domain_id FK
    string approved_scope
    timestamptz valid_from
    timestamptz valid_to
  }
  PROPOSED_PRODUCT_DOMAIN_MEMBERSHIP {
    uuid company_id FK
    uuid domain_id FK
    uuid product_id FK
    string membership_state
    string local_availability_state
    string reason
    int row_version
  }
  PROPOSED_MEMBERSHIP_HISTORY {
    bigint id PK
    uuid company_id FK
    uuid domain_id FK
    uuid product_id FK
    string action
    string before_state
    string after_state
    uuid actor_user_id
    timestamptz at
  }
```

**Important:** every `PROPOSED_*` entity is conceptual only. No SQL DDL, FK, uniqueness, index, RLS policy or grant was created. Naming is illustrative for owner review, not approved schema.

### 3.3 Authorization flow

Standalone source: `TASK-PM-01C_AUTH_FLOW.mmd`.

```mermaid
sequenceDiagram
  participant Client
  participant AuthGuard
  participant PermissionsGuard
  participant Gate as DomainCatalogGate FOUNDATION
  participant Authority as Proposed Authority
  participant Access as CatalogAccess IMPLEMENTED
  participant DB as PostgreSQL and RLS
  participant Audit as Immutable History

  Client->>AuthGuard: Bearer token
  AuthGuard->>AuthGuard: verify live session, user, company
  AuthGuard->>PermissionsGuard: AuthContext without domain identity
  PermissionsGuard->>PermissionsGuard: existing central RBAC check
  PermissionsGuard->>Gate: domainId plus action plus actor

  alt Current PM-01B state, no approved authority
    Gate-->>Client: 400 missing context or 503 fail closed
    Note over Gate,DB: No domain resolve, membership read, write, or history query
  else Future owner-approved contract only
    Gate->>Authority: resolveDomain company, actor, domainId, action
    Authority-->>Gate: same-company descriptor or null
    Gate->>Authority: authorize action-specific domain scope
    Authority-->>Gate: allow or deny
    Gate->>Access: enter shared transaction and central permission recheck
    Access->>DB: set app.company_id and app.user_id inside transaction
    Gate->>Authority: revalidate domain authorization inside transaction
    Access->>DB: proposed membership read or write
    DB->>DB: existing company RLS plus proposed domain RLS
    DB-->>Audit: atomic before and after domain membership event
    Audit-->>Client: success with auditable correlation
  end
```

No domain-level authority provider is registered. The "future" branch is a target-state requirement, not executable behavior.

### 3.4 Proposed product membership lifecycle

Standalone source: `TASK-PM-01C_MEMBERSHIP_LIFECYCLE.mmd`.

```mermaid
stateDiagram-v2
    [*] --> Absent
    state "Absent - no membership row" as Absent
    state "Available - proposed" as Available
    state "Unavailable - proposed" as Unavailable
    state "Withdrawn or Suspended - proposed" as Withdrawn
    state "Retained History - proposed" as History
    state "Central Blocked - existing central lifecycle" as CentralBlocked
    state "Domain Retired - proposed" as DomainRetired

    Absent --> Available: PM-B5 approved add
    Available --> Unavailable: PM-B5 approved local suspend
    Unavailable --> Available: PM-B5 approved reactivate
    Available --> Withdrawn: PM-B5 approved withdrawal
    Unavailable --> Withdrawn: PM-B5 approved withdrawal
    Withdrawn --> History: PM-B7 immutable snapshot
    Available --> History: every transition writes event
    Unavailable --> History: every transition writes event

    CentralBlocked --> History: local state cannot revive central stop
    DomainRetired --> History: PM-B7 snapshot preserves domain identity
    Available --> CentralBlocked: central lifecycle dominates
    Unavailable --> CentralBlocked: central lifecycle dominates
    Available --> DomainRetired: PM-B2 approved retirement
    Unavailable --> DomainRetired: PM-B2 approved retirement

    note right of Absent
      PROPOSED ONLY. All state names and
      transitions require PM-B2, PM-B4,
      PM-B5 and PM-B7 owner approval.
      No membership state is implemented.
    end note
```

## 4. Central-versus-domain responsibility matrix

This matrix preserves the mission's organizational model. "Recommended" entries are **not approvals**.

| Capability | Central Headquarters | Operational Domain | Shared / approval gate | Current implementation |
|---|---|---|---|---|
| Global product identity, SKU/code, taxonomy, UOM, tax/compliance flags | Owns and governs | Reads as authorized; no local clone | D1–D5 unchanged | IMPLEMENTED |
| Central product lifecycle active/blocked/discontinued/deleted | Owns | Cannot override | Sensitive-change D4 preserved | IMPLEMENTED |
| Immutable central catalog history | Owns and audits | May receive approved privacy-filtered view | PM-B8 decides cross-domain visibility | IMPLEMENTED for central catalog |
| Warehouses, vehicles/fleet, operational inventory | Policy/oversight | Delegated operational autonomy | Explicit resource mapping needs PM-B1/PM-B4 | EXISTING resources; Product Master integration PROPOSED |
| Domain-specific pricing | Policy/oversight | Delegated autonomy | `pricing_domain` is not catalog identity | EXISTING pricing module; no PM execution here |
| Domain-level users and permissions | IAM standards/security | Delegated assignment within approved scope | PM-B3/PM-B4/IAM approval | Company-level IAM IMPLEMENTED; domain scope PROPOSED |
| Authoritative domain registry and lifecycle | Recommended central governance of single registry | Uses stable IDs; no local parallel registry | PM-B1/PM-B2 approval | BLOCKED |
| Actor-to-domain assignment | IAM/security policy | Domain-scoped assignment | PM-B4 approval | BLOCKED |
| Product membership add/remove/deactivate | Central authority if explicitly reserved; otherwise oversight | Local management if approved | PM-B4/PM-B5 approval | PM-01B fail-closed only |
| Domain availability/activation | Cannot be inferred from central active | Local state within approved boundaries | PM-B5 approval; central stop dominates | BLOCKED |
| Domain-specific commercial/operational attributes | Catalog invariants | Local attributes if approved | PM-B5/PM-B8 privacy approval | PROPOSED; no downstream execution |
| Cross-domain history/detail visibility | Central oversight role if approved | Own-domain visibility by default | PM-B8 approval | BLOCKED |
| Domain retirement/history retention | Governance/data-retention policy | Domain operational transition | PM-B2/PM-B7 approval | BLOCKED |
| DB company RLS and runtime role | Existing platform control | Uses same boundary | No weakening allowed | IMPLEMENTED and previously CI-tested |
| DB domain RLS | Security-approved migration | Domain-scoped rows | PM-B1/B3/B4 approval plus native tests | PROPOSED / UNVERIFIED |

## 5. Proposed API contract changes, if owner decisions are approved

Current PM-01B OpenAPI contains **194 paths / 277 operations / 137 schemas / 3 webhooks** and all domain endpoints are fail-closed. PM-01C changes no contract.

| Existing PM-01B route | Current behavior | Proposed future contract activation | Required decisions |
|---|---|---|---|
| `GET /product-domain-integration` | `200 available:false` with eight decisions and technical prerequisites | `available:true` only after approved provider **and** membership persistence are both registered and tested | PM-B1–PM-B8 |
| `GET /products/{id}/domain-catalog` | 503 with no data | Retire or redirect to approved membership endpoints; never imply universal availability | PM-B6/PM-B8 |
| `GET /operational-domains` | 503 | 200 with approved list/search fields, privacy filtering and pagination | PM-B1/PM-B2/PM-B3 |
| `GET /operational-domains/current` | 400 missing context or 503 | 200 with server-resolved same-company descriptor | PM-B1/PM-B3/PM-B4 |
| `GET /operational-domains/{domainId}/products` | 503 | 200 with domain membership and local availability; absent products handled per PM-B6 | PM-B3/PM-B5/PM-B6 |
| `POST /operational-domains/{domainId}/products` | 503 before write | Approved create membership with canonical product reference, reason and optimistic concurrency | PM-B4/PM-B5 |
| `PATCH /operational-domains/{domainId}/products/{productId}` | 503 before write | Approved domain-level status/availability transition | PM-B2/PM-B4/PM-B5 |
| `DELETE /operational-domains/{domainId}/products/{productId}` | 503 before write | Approved explicit withdrawal; history retained | PM-B5/PM-B7 |
| `GET /products/{id}/domain-membership` | 503 | 200 for authorized domain/central role with explicit absent/unavailable distinction | PM-B3/PM-B6/PM-B8 |
| `GET /products/{id}/domain-membership/history` | 503 | 200 with immutable history and domain identity snapshot | PM-B7/PM-B8 |
| New `/operational-domains/{domainId}/candidate-products` | Not implemented | Browse not-yet-registered central products under approved privacy rules | PM-B6 |
| New `/operational-domains/{domainId}/membership-history` | Not implemented | Domain-scoped immutable history with retirement-safe identity | PM-B7/PM-B8 |
| New domain registry and actor-assignment admin APIs | Not implemented | Central/IAM administration only after vocabulary and authority matrix approval | PM-B1/PM-B2/PM-B3/PM-B4 |

No proposed permission code is specified here. IAM/security must approve exact permission names, wildcard rules, assignment semantics, revocation/expiry and delegated administration.

## 6. Security and data-integrity boundary summary

Detailed requirements are in `TASK-PM-01C_SECURITY_MODEL.md`. Non-negotiable rules:

- Authentication and company isolation come from verified session/company context, not caller-supplied company IDs.
- Domain identity must be resolved server-side; a path/header UUID is not identity.
- Actor-to-domain assignment must be explicit, company-scoped, revocable and action-specific.
- Read, write and history endpoints each need authorization; company-level view permission is not sufficient for domain data.
- Every relevant service write boundary must recheck authorization inside the shared transaction before any mutation.
- Existing `dms_app` company RLS remains. Domain RLS requires an approved registry/migration and native runtime-role evidence; no DB-level domain enforcement is claimed today.
- Membership history must preserve a domain identity snapshot so retirement/rename/remapping cannot rewrite historical meaning.
- Domain retirement, central deactivation and product deactivation must not delete history.
- No broad grants, RLS weakening, `security definer` shortcut, fake role mapping or client-trusted domain claim is allowed.

## 7. Readiness statement

This architecture package is **PASS WITH FINDINGS** as documentation: it is internally consistent with the implemented fail-closed baseline and makes all eight decisions owner-reviewable. It is **PARTIAL PASS** for implementation readiness because technical prerequisites are identified, but **BLOCKED** for domain registry, IAM vocabulary, membership persistence, lifecycle workflows and consumer activation. Domain-level RLS/history/concurrency evidence is **UNVERIFIED** because no approved schema or executable tests exist. Overall Product Master business acceptance remains **BLOCKED**.
