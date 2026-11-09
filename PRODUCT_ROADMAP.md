# Green-DMS Product Completion & Evolution Roadmap

> **Document status:** Canonical product-development baseline — merged to `main` (PR #7) and in effect.
> **Repository:** `Tadbir-Sabz/Green-DMS`
> **Primary language of product UX:** Persian (fa-IR), full RTL; optional English localization.
> **Last updated:** 2026-11-06 (Gate 1 checkpoint correction — factual updates only; see `docs/product-inventory/ROADMAP_UPDATE_PROPOSAL.md`)

## 1. Product vision

Build a reliable, comprehensive, competitive Distribution Management System (DMS) for Iranian companies operating in capillary distribution. The product must support the real end-to-end operating model—not merely expose a large number of menus or partially implemented screens.

Green-DMS should progressively provide an integrated operational platform for customer and credit management, product and pricing, sales, inventory, procurement, distribution, fleet and field operations, finance, statutory e-invoicing, analytics, mobile execution, and controlled integrations.

The roadmap is outcome-driven. Existing modules must be completed, missing capabilities must be added, and genuinely missing business domains must be introduced as first-class modules when justified.

## 2. Non-negotiable product principles

1. **Business-process completeness:** Design around end-to-end distribution workflows and real Iranian operating practices.
2. **No menu-count development:** A screen, route, button, table, or database entity is not proof that a business capability is complete.
3. **Discover before deciding:** Inspect the repository, schema, migrations, API contract, authorization, UI, tests, deployment behavior, and runtime evidence before classifying a capability.
4. **Extend and create:** Complete existing modules; add missing capabilities; create new modules when a distinct domain, lifecycle, ownership, permissions, reporting, or integration boundary warrants it.
5. **Evidence-based scope:** New modules must be justified by business value, market expectations, compliance, operational risk, or a documented competitive opportunity. Do not add speculative complexity.
6. **Integrated by design:** Every module must define upstream/downstream dependencies, shared identifiers, events, APIs, permissions, and cross-module acceptance tests.
7. **Persian-first experience:** All user-facing workflows, validation, help, onboarding, and manuals must support clear Persian, correct RTL, Jalali display where appropriate, Persian number/date formatting, and mixed Persian/English technical content. Provide English localization where useful.
8. **Security and tenant isolation:** Enforce tenant boundaries, least privilege, auditable actions, secure secrets, and role/permission checks in both API and UI.
9. **Operational reliability:** Prefer traceable transactions, idempotency, recoverability, observability, safe retries, and explicit handling of partial failures.
10. **No unapproved production impact:** Never run destructive migrations, change production/staging data or infrastructure, restart shared services, or deploy/merge without the required authorization.
11. **Preserve verified work:** Avoid unnecessary rewrites. Keep historical reports historical; update current documentation without rewriting history.
12. **Quality over speed:** A module advances only when its evidence-backed completion gate passes.

## 3. Current known baseline (not a substitute for fresh verification)

At the time this roadmap was drafted:
- The repository README describes NestJS 12 API, Next.js 16 web, PostgreSQL 16/PostGIS, Redis, MinIO/S3, OpenAPI contracts, and three Android applications.
- The README describes API and web as active surfaces and Android applications as present but not yet buildable.
- TASK-18R was merged to `main` through merge commit `3daca7c66e9224561f70d4cefbcaf0b8fdc05d32`.
- TASK-19 (runtime packaging, Docker deployment validation, and release readiness) was reported as in progress when this roadmap was agreed.

Verified checkpoint corrections (2026-11-06, TASK-21 — factual, evidence in `docs/product-inventory/EVIDENCE_INDEX.md`):
- TASK-19 completed and merged to `main` via PR #6; merge commit `d39ba068ed9dae1bcb9f6aac241ec9f5e2bffdf5` is the latest `main` commit as of Gate 1 (verified against the remote).
- Independent release QA (TASK-20) verdict: `PASS WITH FINDINGS`; owner-approved deferrals remain open: browser E2E blocked by the `minio/minio` registry issue (user workflows `UNVERIFIED`), backup/restore and operational upgrade/rollback unproven, real SMS/Moadian/PSP gateways unverified.
- Gate 1 (product inventory and dependency map) produced by TASK-21 under `docs/product-inventory/`; pending owner review.

These facts must be re-verified against the live repository and runtime before execution. Do not treat this section as a current deployment-health claim.

## 4. Immediate sequencing and program gates

### Gate 0 — Finish and assess TASK-19

Do not start parallel business-module implementation while TASK-19 is in progress.

1. Review the complete TASK-19 report and changed-file/commit evidence.
2. Distinguish verified results from blocked or unverified checks.
3. Obtain independent, read-only QA for material release risks where justified.
4. Resolve release-blocking findings or record explicit owner-approved deferrals.
5. Do not merge or deploy without owner authorization.
6. Once the runtime baseline is stable, record the verified baseline commit, environment, and remaining limitations here or in the linked execution record.

### Gate 1 — Build the actual product inventory and dependency map

Before selecting the first business module, inspect the current implementation across:
- Navigation, pages, forms, dialogs, dashboards, and user workflows.
- API controllers, services, DTOs, validation, guards, and OpenAPI operations.
- Database tables, constraints, indexes, migrations, seed data, and tenant scoping.
- Roles, permissions, approval workflows, audit trails, and notifications.
- Background jobs, queues, integrations, exports, and scheduled operations.
- Automated tests, manual test evidence, deployment/runtime behavior, and known defects.
- Android application status and the actual build/run path for each app.

Produce:
- A complete module and capability inventory.
- A dependency map (prerequisites, upstream/downstream consumers, shared services).
- A gap register with severity, business impact, evidence, and proposed disposition.
- A distinction between implemented, partial, missing, broken, redundant, and unverified capabilities.
- A prioritized module sequence, revised when evidence requires it.

### Gate 2 — Complete modules iteratively

Work on one coherent module or tightly coupled domain at a time. Do not move to the next module until the current module passes its completion gate, except for explicitly approved prerequisite work.

## 5. Module assessment and completion standard

For every module, follow this lifecycle:

1. **Discover:** Establish the actual state from code, database, API contract, UI, tests, and runtime evidence.
2. **Assess business needs:** Document actors, jobs-to-be-done, workflows, business rules, exceptions, approvals, and Iranian market requirements.
3. **Benchmark:** Compare against credible DMS/ERP products, relevant industry practices, and applicable Iranian regulations. Cite current sources and distinguish verified facts from interpretation. Do not claim competitive parity without evidence.
4. **Define target capability:** Specify scope, non-goals, user journeys, data model, API/contract, permissions, audit, reports, notifications, integrations, failure handling, and migration strategy.
5. **Implement:** Complete the real workflow end-to-end, including backend, database, web/mobile where applicable, and operational support.
6. **Verify:** Add unit, integration, contract, authorization, tenant-isolation, migration, UI, and end-to-end tests appropriate to the risk.
7. **Integrate:** Re-test upstream/downstream workflows and regression suites for previously completed modules.
8. **Document and hand off:** Update user-facing Persian help/manuals and technical docs; provide evidence, limitations, and the next justified step.

### Capability status vocabulary

Use exactly one primary status per assessed capability:
- `IMPLEMENTED & VERIFIED`
- `IMPLEMENTED WITH GAPS`
- `MISSING`
- `BROKEN`
- `NEEDS REDESIGN`
- `UNVERIFIED`
- `NOT APPLICABLE` (with a reason)

Never mark a capability verified based only on a route, UI element, schema, mock, or unexecuted test.

### Required module deliverables

Each module must leave behind:
- Current-state inventory and evidence.
- Business requirements and workflow diagrams or equivalent structured descriptions.
- Gap/decision register and prioritized scope.
- Target design and dependency updates.
- Implementation and migration notes.
- Automated test results and reproducible verification instructions.
- Security, tenant-isolation, authorization, audit, and performance considerations.
- Persian UX/help/manual updates.
- Cross-module regression results.
- Final verdict: `PASS`, `PASS WITH FINDINGS`, `REVISE`, `FAIL`, `BLOCKED`, or `UNVERIFIED`.
- Explicit remaining risks and owner decisions required.

## 6. Initial domain map and candidate module catalog

This is a discovery checklist, **not a claim that every item is currently absent or that every candidate must become a separate module**. During Gate 1, map each capability to its real implementation and determine whether it belongs in an existing module, a shared platform capability, or a new bounded module.

### A. Platform, organization, and master data
- Company, legal entity, tenant, branch, depot, warehouse, and organizational hierarchy.
- Users, teams, roles, permissions, delegation, and approval policies.
- Fiscal periods, calendars, shifts, working days, and regional settings.
- Product groups, categories, brands, attributes, variants, units of measure, and conversion rules.
- Product master: SKU, multiple barcodes, Persian/Latin names, packaging, images, tax attributes, shelf life, batch/serial tracking, substitutes, complementary items, bundles, and lifecycle status.
- Shared reference data and controlled import/export.

### B. Customer, market, and commercial master data
- Customers, stores, chains, legal/individual parties, contacts, addresses, geolocation, and trade classifications.
- Territories, routes, visit plans, customer segmentation, and coverage.
- Credit profile, credit limits, payment terms, guarantees, checks, debt exposure, and blocked-customer rules.
- Supplier and vendor master data.

### C. Pricing, promotions, and trade terms
- Price lists by customer, channel, region, branch, date, and quantity.
- Price history and immutable price snapshots on confirmed orders/invoices.
- Discounts, cascading/stackable rules, approval thresholds, campaigns, bundles, gifts, loyalty, and promotion settlement.
- Margin floors, profitability checks, tax/fee calculation, and price simulation.

### D. Sales and order management
- Field sales, telesales, assisted and self-service order capture.
- Draft/submitted/approved/rejected/fulfilled/cancelled order lifecycles.
- Availability and credit checks, reservations, substitutions, backorders, and partial fulfillment.
- Sales targets, quotas, commissions, returns, and sales performance.

### E. Inventory, warehouse, and procurement
- Multi-warehouse stock, locations/bins, stock ledger, reservations, transfers, adjustments, and cycle counts.
- Batch/lot, serial, expiry, FEFO/FIFO, damaged/blocked/quarantined stock, and traceability.
- Receiving, put-away, picking, packing, replenishment, dispatch, and loading verification.
- Procurement requests, purchase orders, supplier pricing, receiving, supplier returns, and purchase settlement.
- Costing, valuation, landed cost, and stock reconciliation.

### F. Distribution, delivery, and fleet
- Dispatch planning, load planning, route optimization, capacity constraints, and vehicle assignment.
- Driver/distributor tasks, delivery sequence, proof of delivery, signatures/photos/GPS, partial delivery, failed delivery, and reason codes.
- Cash/check/card collection at delivery, reconciliation, and handover.
- Fleet, vehicles, maintenance, fuel, insurance, inspections, incidents, and operating costs.
- Reverse logistics, customer returns, damaged goods, and reusable packaging/crates.

### G. Finance, accounting, and compliance
- Accounts receivable/payable, receipts, payments, cash/bank, checks, settlements, and reconciliation.
- General ledger, chart of accounts, journals, cost centers, fiscal close, and financial statements.
- Automated accounting events with traceability back to source documents and controlled reversals.
- Tax/VAT, statutory invoice lifecycle, Moadian integration, error recovery, and reconciliation.
- Credit control, collection worklists, aging, promises to pay, and dispute handling.

### H. Field workforce and mobile applications
- Salesperson, distributor/driver, and telesales workflows.
- Offline-first operation, local persistence, encrypted token/session storage, outbox, conflict resolution, and reliable sync.
- GPS/visit evidence, geofencing where justified, route execution, catalog/pricing, order capture, collection, delivery, and proof of delivery.
- Device registration, remote session revocation, app version policy, diagnostics, and controlled rollout.

### I. Shared platform capabilities and potential new modules
- Workflow and configurable approval engine.
- Notification center (in-app, SMS, email, push) with templates, preferences, delivery status, and retries.
- Document and attachment management with access control, retention, and audit.
- Task/activity/case management for operational exceptions and follow-up.
- Rules/configuration engine with versioning, simulation, and audit.
- Integration hub: API keys, OAuth/client credentials, webhooks, retries, dead-letter handling, mapping, and observability.
- Import/export center with validation, preview, error reports, and large-file processing.
- Identity/security administration, audit/compliance center, and access reviews.
- Reporting/BI, dashboards, data exports, and scheduled reports.
- System administration, health/observability, backup/restore evidence, and operational runbooks.

### J. Advanced and differentiating capabilities (evaluate by value)
- Demand forecasting, replenishment suggestions, and stock-out risk.
- Route and territory optimization using actual constraints and measured outcomes.
- Sales opportunity/next-best-action recommendations.
- Anomaly detection for discounts, returns, stock movements, collections, and operational leakage.
- Profitability by SKU, customer, route, salesperson, vehicle, and channel.
- Customer portal, supplier portal, and configurable B2B ordering.
- Promotion effectiveness and trade-spend analytics.
- Product/lot traceability and recall workflows.
- Multi-company consolidation and advanced franchise/distributor models.

## 7. Provisional implementation order

The actual order must be confirmed or adjusted after the inventory and dependency map. The following is the starting hypothesis:

1. **Platform and master data foundations:** tenant/company/branch/warehouse, users/roles/permissions, units, categories, brands, product master, shared settings.
2. **Customer and market management:** parties, stores, contacts, territories, routes, visits, credit and payment terms.
3. **Pricing and promotions:** price lists, discounts, campaigns, gifts, tax and margin rules.
4. **Inventory and warehouse:** stock ledger, locations, reservations, lots/expiry, transfers, picking and receiving.
5. **Procurement and supplier management:** purchasing, receiving, supplier returns, and cost control; adjust earlier if stock correctness requires it.
6. **Sales and order management:** order capture, validation, approval, fulfillment, returns, targets, and commissions.
7. **Distribution and delivery:** dispatch, load, route execution, delivery evidence, collections, and reverse logistics.
8. **Finance and accounting:** receivables/payables, treasury, GL, source-document accounting, reconciliation, and fiscal close.
9. **Mobile apps:** stabilize the salesperson app first, then distributor/driver, then telesales; validate offline-first behavior and full operational workflows.
10. **Management, BI, and operational intelligence:** trusted metrics, dashboards, alerts, scheduled reports, and profitability.
11. **Integrations and ecosystem:** Moadian, PSP/payment providers, SMS, accounting/ERP, customer/supplier portals, public APIs, and webhooks.
12. **Advanced differentiators:** forecasting, optimization, anomaly detection, and intelligent recommendations, prioritized by measurable value.

Cross-cutting capabilities (security, audit, workflow, notifications, documents, import/export, observability, and integration infrastructure) must be introduced when their dependencies first require them; they must not be postponed artificially to the end.

## 8. First business-module focus: Product Master

After TASK-19 and Gate 1, begin with the master-data prerequisites and Product Master. Do not assume product definition is independent of units, categories, brands, packaging, tax, warehouse tracking, pricing, or customer/order behavior.

The Product Master assessment must explicitly cover:
- SKU uniqueness and tenant/company scope.
- Multiple barcode types and packaging-level barcodes.
- Persian/Latin naming, search, aliases, and duplicate detection.
- Categories, brands, attributes, variants, and configurable characteristics.
- Base and alternate units with precise conversion and rounding rules.
- Carton/pack/unit packaging hierarchy and quantity integrity.
- Batch/lot, serial, expiry, FEFO/FIFO, and traceability requirements.
- Purchase/sales/tax attributes and effective-dated commercial data.
- Images, documents, substitutes, complements, bundles, and product lifecycle.
- Import/export, bulk editing, validation, and audit history.
- Permissions and approval for sensitive changes.
- Integration with price lists, orders, inventory, picking, invoices, returns, accounting, and reports.
- Historical integrity: changing a product's current name, tax, unit, or price must not silently rewrite confirmed historical transaction facts; transactions must retain the appropriate snapshots.
- High-volume search, pagination, indexing, and safe bulk operations.

Product Master is complete only when its actual workflows and downstream consumers pass the relevant integration tests—not merely when create/edit/list screens exist.

## 9. Canonical end-to-end business flows

At minimum, progressively implement and regression-test these flows:

1. **Order-to-cash:** customer/credit → catalog and price → order → validation/approval → reservation → picking/loading → dispatch/delivery → invoice → collection/settlement → accounting → reporting.
2. **Procure-to-stock:** supplier → purchase request/order → receipt and inspection → batch/expiry capture → put-away → supplier invoice/payable → payment → inventory/accounting reconciliation.
3. **Return-to-resolution:** return request/reason → authorization → physical receipt/inspection → restock/quarantine/scrap → credit note/refund/replacement → accounting and analytics.
4. **Route-to-delivery:** territory/visit plan → route and vehicle → load → GPS/route execution → proof of delivery or failure → cash/check/card handover → reconciliation.
5. **Promotion-to-settlement:** campaign rules → eligibility → order pricing → gifts/discounts → approval → fulfillment → supplier/manufacturer or internal settlement → effectiveness analysis.
6. **Period close:** subledger validation → reconciliation → journal review → period close → financial statements and audit trail.

## 10. Competitive and regulatory assessment

For each relevant module:
- Benchmark a balanced set of Iranian-market products and credible international DMS/ERP references.
- Use current, attributable sources (official product documentation, release notes, regulatory sources, and credible demonstrations or reviews).
- Compare workflows and outcomes, not marketing claims or feature names alone.
- Evaluate usability, localization, offline capability, scalability, integrations, security, reporting, implementation complexity, and total operational fit.
- Verify Iranian legal/tax requirements against authoritative and current sources before implementation.
- Record feature parity, gaps, differentiators, evidence quality, and uncertainty.
- Do not copy competitors blindly; prioritize the needs of target Iranian distributors and measurable customer value.

## 11. Architecture and integration rules

- Keep OpenAPI contracts, generated clients, server routes, and web/mobile consumers aligned.
- Establish clear domain ownership and avoid duplicated sources of truth.
- Use stable identifiers, explicit lifecycle states, versioned contracts, and backward-compatible changes where feasible.
- Use transactional outbox/inbox or equivalent reliable patterns for cross-domain asynchronous events when required.
- Make money and exact quantities precision-safe; define unit conversion, rounding, tax, and currency rules explicitly.
- Preserve immutable transaction snapshots and auditable correction/reversal flows.
- Enforce tenant scoping in every data-access path, background job, export, cache key, and integration.
- Design for idempotency, retry safety, concurrency, and partial failure.
- Add indexes and performance budgets based on measured query patterns and representative data volumes.
- Treat database migrations as production-sensitive: forward/rollback strategy, compatibility, backup/restore requirements, and explicit approval gates.

## 12. Execution governance and stop conditions

- Agent 1 owns implementation and technical design.
- Agent 2 is an independent, read-only QA reviewer for important/risky delivery gates; it must not edit source or build files.
- QA scope must be risk-based. Do not repeat audits without a new risk, change, conflicting evidence, or release gate.
- Preserve existing uncommitted work and inspect repository state before any changes.
- Work on a dedicated branch and submit a PR; do not merge, deploy, or modify production/staging without explicit owner approval.
- Do not weaken CI gates to make a task green. Separate product defects from infrastructure/registry failures and retain accurate BLOCKED status.
- Do not restart or reconfigure shared services. Use isolated resources only after proving isolation and cleanup ownership.
- Stop and report before any action that could affect production data, shared infrastructure, external services, or other projects.
- At the end of each module, stop for review. Do not silently proceed to the next module.

## 13. Roadmap change control and continuity across chats

This file is the canonical product-direction reference for Green-DMS.

At the beginning of every new planning or implementation conversation:
1. Read this roadmap from the repository's current default branch.
2. Read the latest execution/status record and inspect the current repository state.
3. Identify the last accepted module, current in-progress task, open blockers, and next approved action.
4. Reconcile any changes since the roadmap was last read; never assume chat history is the source of truth.
5. Continue from the current approved position without restarting completed work or skipping unresolved gates.

Update this roadmap when scope, priority, dependencies, or completion status materially changes. Every update must state what changed and why. Keep detailed task evidence in task-specific reports; this roadmap should remain concise enough to serve as the durable program map.

### Current program checkpoint

- **TASK-PM-01A implementation checkpoint (PR #14, not merged):** existing central Product Master workflows are being integrated with canonical service authorization, shared transactions, immutable history and connected family/category settings. Whole-module acceptance remains **BLOCKED** on authoritative operational-domain identity/authorization; no pricing-domain/branch substitute is allowed. See `docs/product-inventory/TASK-PM-01A_IMPLEMENTATION.md` for the evidence ledger and remaining UX/review findings. This does not change the canonical module sequence or authorize downstream execution.

- **TASK-PM-01B checkpoint (PR #14, not merged):** fresh whole-repository inspection confirmed no authoritative operational-catalog domain identity/lifecycle/authorization. Eight owner decisions are now recorded as OPEN in `docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md`; independently valid fail-closed API/service, contract and Persian RTL decision-screen foundations were delivered and tested. No registry, membership table, permission vocabulary, fabricated data or downstream consumer cutover was added. Domain-aware membership remains **BLOCKED**; technical foundations are **PASS WITH FINDINGS**. See `docs/product-inventory/TASK-PM-01B_IMPLEMENTATION.md`. Changed because owner decisions, not implementation, are the current gate; canonical sequence and D1–D5 are unchanged.

- **TASK-PM-01C architecture/decision package checkpoint (PR #14, not merged):** the eight PM-B1–PM-B8 decisions remain **OPEN / NOT APPROVED**, but are now owner-reviewable with evidence, alternatives, recommendations, consequences, dependencies, migration implications, owner roles and acceptance evidence in `docs/product-inventory/TASK-PM-01C_OWNER_DECISION_PACKAGE.md`. Target architecture, Mermaid diagrams, ER/authorization/lifecycle flows, security model and dependency/next-task plan are recorded in `TASK-PM-01C_ARCHITECTURE.md`, `TASK-PM-01C_SECURITY_MODEL.md`, `TASK-PM-01C_DEPENDENCY_MATRIX.md` and `TASK-PM-01C_ROADMAP_ADDENDUM.md`. This is documentation-only: no registry, membership table, permission vocabulary, lifecycle workflow, API/UI activation, migration or workflow change. Existing fail-closed PM-01B behavior is preserved. Technical package **PASS WITH FINDINGS**, implementation readiness **PARTIAL PASS**, domain activation and overall Product Master business acceptance **BLOCKED**. Changed because the current gate is informed owner approval, not another speculative implementation; canonical sequence and D1–D5 are unchanged.

- **TASK-PM-01D decision-closure and parallel development checkpoint (PR #14, not merged):** all PM-B1–PM-B8 decisions remain **OPEN / NOT APPROVED**; `docs/product-inventory/TASK-PM-01D_OWNER_DECISION_CLOSURE.md` now gives owners a concise Persian decision brief with recommended choices, consequences, dependencies, exact approval evidence, abstract behavior examples and blocker-vs-later sequencing. To avoid blocking unrelated work, a company-wide read-only central catalog history explorer was implemented as `GET /product-catalog/history` and Persian RTL `/products/catalog-history`, using only immutable `0060` evidence, existing company RLS/RBAC and an 11-type central entity allowlist. OpenAPI/TypeScript client and focused API/web tests were updated. No domain registry, domain ID, provider, permission vocabulary, membership table, migration, lifecycle or downstream cutover was added; PM-01B fail-closed boundaries are preserved. Independent milestone **PASS**, decision closure **BLOCKED**, domain implementation and overall Product Master business acceptance **BLOCKED**. See `docs/product-inventory/TASK-PM-01D_IMPLEMENTATION.md`. Changed because the owner gate affects domain work only, not existing central catalog evidence; canonical sequence and D1–D5 are unchanged.
- **TASK-PM-01D-M2 product import reliability (PR #14, not merged):** `0061_product_import_reliability` adds reversible `product_import` status/outcome columns and a tenant‌RLS `product_import_batch` table with SELECT/INSERT/UPDATE‌only runtime grants. The service now claims idempotency atomically under a per‌key advisory lock, records each committed batch outcome in the same product transaction, retries only definitive `40001`/`40P01` rollbacks, resumes an interrupted `processing` record without replaying committed batches and treats unknown transaction outcomes as terminal operator‌review states. OpenAPI, generated TypeScript client and Persian RTL import UI expose status, aggregate outcome, failure category, retryability and per‌batch evidence. §E per‌batch all‌or‌nothing plus continuation is preserved; whole‌file rollback remains an isolated owner policy decision, not an implicit M2 behavior. Independent milestone **PASS WITH FINDINGS**; full Product Master/domain acceptance remains **BLOCKED** because PM‌B1..PM‌B8 are OPEN / NOT APPROVED. See `docs/product-inventory/TASK-PM-01D-M2_IMPLEMENTATION.md`.

- **TASK-PM-01D-M3 Product CSV portability (PR #14, not merged):** a complete user-facing central-catalog export workflow was delivered: `GET /products/export`, a bounded repeatable-read read-only snapshot with existing `master.product.view`/RLS/service authorization, explicit truncation headers, spreadsheet-formula-safe CSV, `audit_log` export evidence, generated client and a Persian RTL download button using the active list filters. A fresh nine-capability assessment, an explicit OPEN whole-file-atomicity owner request and a Persian operator guide were added. No import behavior, migration, queue, domain registry, permission vocabulary, production DB, merge or deploy was changed. Independent milestone **PASS WITH FINDINGS**; full Product Master/domain acceptance remains **BLOCKED** on PM-B1..PM-B8 and the unresolved whole-file decision. See `docs/product-inventory/TASK-PM-01D-M3_IMPLEMENTATION.md`. Canonical sequence and D1–D5 are unchanged.

- **TASK-PM-01D-M4 controlled bulk maintenance checkpoint (PR #14, not merged):** a bounded, synchronous all-or-nothing central-catalog maintenance workflow was delivered for at most 100 selected products and 9 server-owned fields: read-only server preview, durable `0062` operation ledger, explicit confirmation, token/hash/version checks, one transaction for product updates + `0060` history + operation audit + terminal ledger state, idempotent replay, stale/expiry/concurrency rejection and fail-closed unknown reconciliation. API/UI use existing `master.product.update`; protected/D4/domain/inventory/pricing fields remain excluded. No import semantics, owner decision, domain registry, RBAC vocabulary, queue/worker, migration to `0060`/`0061`, protected-branch change, merge or deploy was added. Independent milestone **PASS WITH FINDINGS**; full Product Master/domain acceptance remains **BLOCKED** on PM-B1..PM-B8 and the unresolved whole-file decision. See `docs/product-inventory/TASK-PM-01D-M4_IMPLEMENTATION.md`. Changed because a bounded technical workflow was delivered without altering the owner-gated canonical sequence; D1–D5 and §E are unchanged. A time-of-day CI failure in two unrelated legacy regression tests was diagnosed and fixed by switching them to the shared business-date helper; the exact final SHA and CI outcome are recorded in PR #14 body.

- [x] TASK-18R merged to main (merge commit recorded in Section 3).
- [x] TASK-19 runtime packaging/deployment validation: completed and merged via PR #6 (`d39ba068ed9dae1bcb9f6aac241ec9f5e2bffdf5`); QA PASS WITH FINDINGS — open deferrals recorded in Section 3.
- [x] Product inventory and dependency map: produced by TASK-21 (`docs/product-inventory/`) — pending owner review.
- [ ] Product Master: first planned business-domain focus; readiness assessed precisely by TASK-21R and reconciled after TASK-21Q/21S: **ready for architecture/design**, **conditional-ready for implementation** (no external blockers; owner decisions **D1–D5 approved and recorded** in `docs/product-inventory/PRODUCT_MASTER_TARGET_DESIGN.md` §0; remaining: final design sign-off and the G-03 approval-engine test pack before sensitive-change wiring; P1 bundles are catalog-only per D5) — see `PRODUCT_MASTER_TARGET_DESIGN.md` and `IMPLEMENTATION_SEQUENCE.md` §3. Historical readiness checkpoint; current implementation evidence is in TASK-PM-01A above.
- [ ] Remaining modules: evidence-based sequence proposed in `docs/product-inventory/IMPLEMENTATION_SEQUENCE.md` (P1–P9) — pending owner approval.

## 14. Definition of overall product maturity

Green-DMS should not be declared complete merely because all listed modules have pages or APIs. Overall maturity requires:
- All critical business workflows operate end-to-end with correct transactional and accounting outcomes.
- No unresolved critical security, tenant-isolation, data-integrity, or release-blocking defects.
- Role-based user journeys are usable and fully localized in Persian/RTL.
- Mobile applications build, install, synchronize reliably, and support their intended field workflows.
- Integrations have observable, recoverable failure handling and reconciliation.
- Reports reconcile to source transactions and have documented definitions.
- Backup/restore and deployment procedures have been exercised in an authorized isolated environment.
- Performance and reliability have been measured against agreed representative workloads.
- User documentation, operational runbooks, and support diagnostics are available.
- Remaining limitations are explicit, prioritized, and accepted—not hidden behind a nominal completion label.
