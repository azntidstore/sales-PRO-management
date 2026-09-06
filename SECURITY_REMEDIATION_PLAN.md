# Sales Manager — Security & Data Integrity Remediation Plan

> **Purpose:** Permanent project roadmap embedded in the repository so the repair plan survives future conversations, exports, and AI-assisted edits.
>
> **Current gate:** S6-A — Dependency & Supply-Chain Security Audit; next repair sub-phase requires explicit approval.
>
> **Non-negotiable rule:** Production business data must be preserved. No phase may silently delete, rewrite, or reshape production orders/products/sellers/customers.

## Project baseline

- Stack: React + TypeScript + Vite + Firebase Authentication + Cloud Firestore.
- Interface: Arabic RTL with French/English support.
- Core domains: sellers/users, products, orders, notifications, sync logs, settings.
- Roles: `ADMIN`, `DEPUTY`, `SUPERVISOR`, `SELLER`.
- Production-sensitive data: orders, product prices, seller relationships, order status, profit values.
- Deployment target: Vercel.
- Authentication source of truth: Firebase Authentication.
- Authorization source of truth: Firestore Security Rules + UID-linked profile (Phase S2).

## Repair phases

### PHASE S0 — Baseline & Safety
**Goal:** establish a safe working baseline before security changes.

- Preserve current source and production data.
- Inventory Firebase collections and sensitive fields.
- Confirm environment/secret boundaries.
- Establish diagnostic commands and rollback procedure.
- Never commit Firebase service-account credentials.

**Gate:** baseline documented and recoverable.

### PHASE S1 — Authentication Migration
**Goal:** eliminate legacy client authentication and make Firebase Auth the only identity authority.

- Firebase Email/Password Authentication.
- `onAuthStateChanged` as session source.
- Auth UID → seller profile → active check → role → React memory.
- No passwords in seller documents or application state.
- No password in URL parameters.
- No default credentials.
- No localStorage/sessionStorage authentication state.
- Remove legacy login/profile-switch authentication paths.
- Harden migration utility:
  - real valid emails only;
  - duplicate email detection;
  - UID conflict detection;
  - no password copying/generation/logging;
  - dry-run default;
  - explicit `--execute` for writes;
  - idempotent behavior;
  - no automatic execution.
- Do not modify business schemas or production data in this phase.

**Gate:** lint/build pass, static audit clean, manual auth tests pass, migration script reviewed.

### PHASE S2 — Firestore Authorization
**Goal:** make Firestore enforce authorization independently of the UI.

- Deny unauthenticated access.
- Authorize by Firebase UID/profile.
- `ADMIN`: full permitted administration.
- `DEPUTY`: only permitted subordinate scope.
- `SUPERVISOR`: only assigned sellers/products/orders.
- `SELLER`: only permitted own data.
- Protect settings and sync logs.
- Protect notifications.
- Prevent role escalation and ownership changes from client requests.
- Remove all `allow read/write: if true`.
- Design UID-keyed user/profile lookup for reliable rules evaluation.
- Preserve existing documents through staged compatibility where necessary.

**Gate:** rules simulator/tests + adversarial access tests.

### PHASE S3 — Data & Financial Integrity
**Goal:** make historical orders financially deterministic and resistant to client-side tampering.

- Add stable `sellerId`/UID relationships where appropriate.
- Add stable `productId`.
- Snapshot product name and price at order creation.
- Snapshot seller identity where appropriate.
- Validate quantity/prices/costs.
- Reconcile profit formula.
- Ensure historical profit does not change when product prices change.
- Prevent client-provided privileged financial fields from being trusted blindly.
- Preserve existing orders through migration/backfill with explicit audit.

**Gate:** formula test matrix + legacy-data compatibility tests.

### PHASE S4 — Safe Data Migration
**Goal:** migrate legacy records without loss.

- Full backup/export before writes.
- Dry-run migration report.
- Deterministic mapping.
- Duplicate/conflict report.
- Batch migration with resumability.
- Never delete source data until independently verified.
- Produce before/after counts and reconciliation report.

**Gate:** counts reconcile and sample records match.

### PHASE S5 — Persistence & Concurrency
**Goal:** eliminate unsafe read-all/modify-all/write-all patterns.

- Replace full-array seller/product/order writes with document-level operations.
- Use transactions/batches where required.
- Prevent lost updates from concurrent users.
- Make deletes explicit and authorized.
- Handle optimistic/concurrent updates safely.
- Keep real-time listeners consistent.

**Gate:** concurrency tests and regression tests.

### PHASE S6 — Production Hardening
**Goal:** security, reliability, and performance hardening.

- Dependency vulnerability review (`npm audit`) and controlled upgrades.
- Remove obsolete mock/standby behavior where it can cause confusion.
- Improve error handling and retry behavior.
- Validate all user inputs.
- Review XSS/HTML sanitization.
- Review API/secret exposure.
- Review rate limiting / abuse controls where applicable.
- Improve audit logging.
- Improve monitoring.
- Code-split large frontend bundles.
- Review Vercel production configuration.

**Gate:** production security checklist complete.

### PHASE S7 — Testing & Production Audit
**Goal:** final release confidence.

- Authentication tests.
- Authorization tests.
- Role escalation tests.
- Data isolation tests.
- Order/profit tests.
- Migration reconciliation.
- Regression tests for all existing features.
- Production configuration review.
- Final backup and rollback plan.
- Final security report.

**Final gate:** `PRODUCTION READY` only after all critical findings are closed.

## Permanent rules for future AI-assisted changes

1. Never start the next phase before the current phase is explicitly approved.
2. Never change Firestore Rules during S1.
3. Never execute migrations automatically.
4. Never store plaintext passwords.
5. Never use localStorage/sessionStorage as an authentication or authorization source.
6. Never trust a client-selected role for authorization.
7. Never trust client-calculated financial totals/profits without server-side/rules/application validation appropriate to the architecture.
8. Never delete production data during a repair without an explicit backup and migration plan.
9. Never add service-account keys or private Firebase credentials to frontend code or Git.
10. Every phase must finish with:
   - files changed;
   - reasons for changes;
   - diagnostics;
   - tests;
   - known limitations;
   - explicit gate status.

## Current status

- [x] S0 — Baseline established.
- [x] S1 — Final verification passed locally (V2).
- [ ] S2 — Firestore Authorization — V7 rules/emulator correction pending verification.
- [ ] S3 — Data & Financial Integrity (V13 verification pending).
- [x] S4 — Safe Data Migration — final reconciliation verified.
- [ ] S5 — Persistence & Concurrency — S5-A and S5-B passed; S5-C-A audit passed; S5-C-B passed; S5-C-C concurrency guard implemented, verification pending.
- [ ] S6 — Production Hardening.
- [ ] S7 — Testing & Production Audit.

**Current decision: S0, S1, S2, and S3 passed. S4-A, S4-B, S4-C, S4-D, S4-E, S4-F-0, S4-F-1, S4-G, S4-F-2, S4-F-3, S4-F-4, and S4 Final Reconciliation have passed. S4-F-1 was executed as a controlled same-document identity backfill for sellerId/productId only and was verified post-migration. Historical name snapshots, historical prices, and createdByUid remain intentionally unpopulated because no independent historical proof was found. S4 is closed. S5-A audit completed. S5-B document-level persistence repair is the current approved sub-phase; production data must remain untouched until verification gate passes.**


### S2 V9 change log
- Fixed the S2 rules test syntax error from V8.
- Hardened supervisor order create/update/delete to the supervisor's own/managed seller scope and assignment.
- Hardened `managesSeller()` against missing parent fields.
- Added adversarial tests for authorization-profile isolation, seller scope, product writes, cross-supervisor order access, and supervisor order mutations.
- Product-level supervisor assignment remains a known S3/schema limitation because orders currently store product name rather than stable productId.


### S5-C-C change log
- Replaced direct order `updateDoc()` with a target-document Firestore transaction guarded by the existing `updatedAt` value.
- `DatabaseService.updateOrder()` and both active order-update callers now require the displayed `updatedAt` as `expectedUpdatedAt`.
- A stale version throws `ORDER_CONCURRENCY_CONFLICT`; no stale write is committed.
- Added explicit UI conflict handling so users are asked to refresh/retry instead of silently overwriting a newer order change.
- No Firestore Rules change, migration, delete/recreate, or production-data write is part of this sub-phase.
- Static validation currently passes; local project-wide lint/build still requires dependency installation in the validation environment.
- S5-C-C gate remains **PENDING USER VERIFICATION** until the supplied diagnostic completes successfully.

### Cross-phase constraint — Firebase Free Plan / Performance
- Minimize Firestore reads and realtime listeners; use narrow indexed queries, bounded/paginated reads, shared in-memory caches for already-authorized data, and document-level operations.
- Never use client cache for authorization.
- Review every new listener/query for read amplification and response latency.
- Track read-cost/performance impact before approving S3+ changes.


## Current Progress — S5-D-C-B
- S5-D-A static read/listener audit completed.
- S5-D-B repair verified locally: profile-read coalescing, bounded notification/log feeds, stable notification listener lifecycle.
- S5-D-C-A orders/products read-strategy audit completed: arbitrary limits were rejected because Dashboard, OrdersTable, export, product management, and OrderFormModal semantics depend on complete/shared datasets.
- S5-D-C-B design verified: products remain a shared complete catalog feed; orders require an explicit operational-window + historical-on-demand architecture before narrowing the realtime listener; Dashboard metrics must be independently validated before the orders listener can be bounded.

## Current Progress — S5-D-B
- S5-D-A static read/listener audit completed with review-required findings.
- S5-D-B repair package prepared: profile-read coalescing, bounded notification/log feeds, and notification listener lifecycle stabilization.
- Products/orders broad listeners are intentionally deferred to a dedicated pagination/window design so existing historical visibility is not silently broken.
- Gate: requires local validation before any S5-D-C work.


## S5-D-C Audit Progress
- Orders/products read strategy audit package added.
- No production data mutation.


## Current status — S5-D-C-C
- S5-D-C-B: VERIFIED.
- S5-D-C-C: Orders data-layer pagination preparation implemented for ADMIN/DEPUTY/SELLER plus targeted getOrderById.
- Supervisor merged pagination, UI cutover, dashboard strategy, realtime windowing, and products optimization remain deferred to subsequent gated sub-phases.

## Current Progress — S5-D-C-D
- S5-D-C-A: VERIFIED.
- S5-D-C-B: VERIFIED.
- S5-D-C-C: VERIFIED; bounded order data-layer APIs prepared without changing the live listener.
- S5-D-C-D: Dashboard metric strategy design prepared for validation. Dashboard completeness, historical financial semantics, role authorization boundary, and cost constraints must be validated before any Dashboard/order-listener cutover.

### S5-D-C-E0 — Dual Role / Multi-Context Architecture Design (ADDED)
- Same Firebase Auth UID/email/password for a person who is both SELLER and SUPERVISOR.
- Separate authoritative role capabilities from active in-memory workspace.
- Seller workspace shows own orders only; supervisor workspace shows managed sellers/orders.
- Preserve parentId/parentIds relationships and existing single-role compatibility.
- No Rules, production data, migration, or runtime cutover in E0.
- Design Free-plan listener/read constraints before pagination implementation.
Gate: design validator PASS, no production operations.


### S5-D-C-E1 — Dual-role Data/Auth Foundation
- Support a single Firebase UID with multiple declared role contexts (`roles[]`).
- Preserve legacy primary `role` for compatibility until S5-D-C-E2 Rules are upgraded.
- Expose role contexts to the authenticated in-memory session without persisting the active workspace.
- No second Firebase Auth account.
- No production migration or writes in E1.
- Active workspace remains UI/session state only and is not an authorization source.
Gate: static role-context tests, lint, build, and S2 Rules regression; no production mutation.


### S5-D-C-E2 — Dual-role Firestore Authorization
- Firestore Rules upgraded to recognize legitimately declared multi-role capabilities on the authenticated UID.
- Legacy `role` remains authoritative for compatibility; optional `roles[]` is validated and cannot be self-assigned.
- SELLER capability preserves own seller/order scope; SUPERVISOR capability preserves managed-seller/order scope.
- Active UI workspace is never consulted by Rules and cannot expand server authorization.
- Added dual-role positive/negative adversarial Rules tests, including cross-supervisor and self-escalation cases.
- No production Firestore writes, deletes, migrations, or Auth changes.
Gate: static E2 validator, lint, build, and Rules regression/adversarial tests; production operations must remain 0.


### S5-D-C-E3 — Dual Workspace UX & Runtime Switching
- Same Firebase Auth account/UID; dual-role chooser and no-logout switching.
- Workspace is UI/session state only; authoritative role capabilities remain in /users/{uid} and Firestore Rules.
- Scoped listeners are torn down/re-attached on switch; caches reset to prevent cross-workspace stale display.
- No production migration/writes.
Gate: static validator, lint, build, S2+E2 emulator regression, manual workspace smoke test.

### S2-B5.6-R3 controlled rules refactor — 2026-09-04
- Refactored the `orders.update` authorization path to avoid the redundant `identityBackfillOnly()` branch (ADMIN already has the ordinary update permission) and to evaluate the caller profile once inside the update authorization helper.
- Added a dedicated supervisor-scope helper using the target seller document only when a managed-seller check is actually needed.
- Preserved ADMIN/DEPUTY primary-role behavior, SUPERVISOR/SELLER dual-role behavior, seller ownership/creator checks, financial validation, historical snapshot protection, and the legacy identity-backfill function for its other existing uses.
- Local validation must be completed on the Windows project environment before this sub-phase is considered closed. No Firebase deploy or production-data migration is part of this refactor.
- The known pre-refactor emulator symptom was 13 denied `orders.update` evaluations hitting the 1000-expression ceiling while the 75/75 authorization tests still passed; the post-refactor Windows emulator run is the required gate.

### S5-D-C-C.4 implementation — 2026-09-04
- Added bounded operational order reads and on-demand historical paginated reads to the Firestore data layer.
- Added corresponding DatabaseService wrappers without removing the legacy realtime cache/listener yet, preserving existing UI compatibility while the next validation gate confirms behavior.
- SELLER remains seller-scoped; ADMIN/DEPUTY receive bounded chronological reads; SUPERVISOR historical pagination remains explicitly unsupported as a single cursor because its scope is a union of two queries.
- Added single-document order access remains available through `getOrderById`.
- No Firestore Rules changes, production writes, migrations, or deployments.
- `.env` and `.env.local` are included as safe templates only; Firebase values remain blank for the user to fill.
- S5-D-C-C.4 is **IMPLEMENTED — PENDING WINDOWS VALIDATION**.

### S5-D-C-C.5.1 — Order Store Contract — 2026-09-04
- Added an in-memory Order Store contract separating operational order state from historical page state.
- Added bounded operational-store loading, cached first-page historical loading, and single-order view loading with operational-store-first fallback.
- Existing Firebase listeners, legacy `getOrders()` cache, authorization Rules, order documents, and write paths remain unchanged in this sub-phase.
- The Order Store is client-side state only and is never an authorization source.
- No Firestore Rules changes, production writes, migrations, or deployments.
- C-C.5.1 implementation is **PENDING WINDOWS VALIDATION**.

### S5-D-C-C.5.2 — OrdersTable Integration — 2026-09-04
- Integrated an explicit historical-order mode into `OrdersTable` using the existing paginated data-layer API.
- The default operational view remains unchanged and continues using the existing live cache/listener.
- Historical mode loads bounded pages (50 records per request) and keeps only loaded pages in memory; it does not automatically read the entire collection.
- Added explicit return-to-operational and load-more controls.
- Existing role filtering, search, sorting, client-side pagination, and order write handlers remain in place for compatibility.
- No Firestore Rules changes, production writes, migrations, or deployment.
- C-C.5.2 is **PENDING WINDOWS VALIDATION**.

### S5-D-C-C.5.2-FIX — Historical Controls — 2026-09-04
- Restored/ensured the actual OrdersTable JSX controls for historical mode: `تحميل المزيد` and `العودة للطلبات الحالية`.
- The controls are rendered inside the existing orders-table wrapper and use the already validated historical paging state/API.
- No changes to Firestore Rules, financial validation, production data, migrations, or write paths.
- Previous C-C.5.2 validation remained green for build/S2/S3; this fix requires a fresh Windows validation before closure.


### S5-D-C-C.5.3 — Query Matrix / Index Foundation — 2026-09-04
- Implemented the bounded historical/operational query foundation without replacing the existing OrdersTable client-side compatibility filters.
- Added `firestore.indexes.json` with only the two composite indexes required by the current scoped order queries: `sellerId + createdAt` and `assignedSupervisorId + createdAt`.
- Preserved the existing role boundary: SELLER is seller-scoped; SUPERVISOR remains a two-query union; ADMIN/DEPUTY use bounded chronological reads.
- Kept free-text search, legacy `orderDate` filtering, legacy display fields, and UI filtering client-side for now; no semantic change to existing filters.
- No Firestore Rules changes, production writes, migrations, deletes, or deployment.
- This sub-phase is IMPLEMENTED — PENDING WINDOWS VALIDATION.

### S5-D-C-C.5.4 — Dashboard Query Range & Completeness Specification — 2026-09-04
- Defined the exact Dashboard date-filter semantics and role-specific query scopes before replacing the current complete `orders` prop with bounded historical reads.
- Preserved the existing `orderDate` semantics for `today`, `this_month`, and `last_30_days`; the existing data-layer `createdAt` ordering/range must not silently redefine Dashboard meaning.
- Established completeness requirements for `all` and bounded periods, including explicit treatment of partial/insufficient datasets.
- Documented the SUPERVISOR union-scope limitation and the requirement for a safe union pagination design before single-cursor historical Dashboard loading for that role.
- No Rules changes, production writes, migrations, deletes, or deployments.
- C-C.5.4 is DESIGN COMPLETE — PENDING WINDOWS VALIDATION.

### S5-D-C-C.5.5 — Dashboard Bounded Historical Integration — 2026-09-04
- Integrated exact `orderDate`-based, on-demand Dashboard reads for `today` and `this_month` only.
- The data layer exhausts bounded pages and returns an explicit `complete` result; Dashboard uses the result only when completeness is proven.
- SELLER uses seller-scoped `sellerId + orderDate` queries; ADMIN/DEPUTY use authorized orderDate ranges; SUPERVISOR uses the existing two-query union with independent pagination and de-duplication.
- `all` and `last_30_days` retain existing semantics until their completeness/date-contract requirements are separately proven; no silent createdAt substitution.
- Added only the two orderDate composite indexes required for SELLER/SUPERVISOR scoped queries.
- No Rules changes, production writes, migrations, deletes, or deployment.
- Replaced the permanent orders realtime listener with a 30-day/100-document operational window, preserving role scopes and existing live updates while moving historical reads to explicit on-demand queries.
- Dashboard labels `all`/`last_30_days` as bounded operational data until complete historical retrieval or an aggregate architecture is established; it does not silently present the bounded window as complete.
- S5-D-C-C.5.5 is IMPLEMENTED — PENDING WINDOWS VALIDATION.

### S5-D-C-C.5.6 — Dashboard Range & Completeness Regression Tests — 2026-09-04
- Added `tests/dashboard-range-contract.test.mjs` covering `today` and `this_month` boundaries, SELLER scope, ADMIN/DEPUTY authorized chronological range queries, SUPERVISOR assigned/own union scope, cross-supervisor exclusion, and the need for document-id de-duplication across the supervisor union.
- Added `npm run test:s5-dashboard-range` using the Firestore emulator; no production Firebase operations are involved.
- Tests use fixed dates and explicit order documents so the gate is deterministic and does not depend on the machine clock.
- No Firestore Rules changes, production writes, migrations, deletes, or deployments.
- S5-D-C-C.5.6 is VERIFIED — Windows validation: 9/9 Dashboard range tests, S2 75/75, S3 10/10, build PASS, Rules R3 unchanged.


### S5-D-C-C.5.7 — Dashboard Last-30-Days Completeness — 2026-09-04
- Extended the exact `orderDate`-based Dashboard range loader to `last_30_days` using a deterministic 30-calendar-day inclusive window ending on the current UTC date, matching the existing Dashboard date semantics while removing dependence on the bounded realtime `createdAt` window.
- Dashboard now treats `last_30_days` as a complete range only after the data-layer query exhausts its pages; it no longer falls back to client-side filtering of the bounded operational listener for this filter.
- SELLER remains constrained by `sellerId`; ADMIN/DEPUTY use the authorized date range; SUPERVISOR continues using the two-query authorized union with document-id de-duplication.
- Added regression coverage for the inclusive 30-day boundary and SELLER scope.
- `all` remains intentionally outside this sub-phase because a complete unbounded historical read could create unacceptable Firestore read cost on the Free plan; aggregate architecture or explicit on-demand full-history retrieval must be evaluated separately before changing its semantics.
- No Firestore Rules changes, production writes, migrations, deletes, or deployments.
- C-C.5.7 is IMPLEMENTED — PENDING WINDOWS VALIDATION.


### S5-D-C-C.5.8 — Dashboard ALL Strategy — 2026-09-04
- Evaluated complete historical reads, client aggregation caches, server-maintained rollups, and Firestore aggregation queries.
- Selected the hybrid strategy: scalar ALL KPIs via Firestore aggregation where Rules-compatible; complete document charts remain explicit historical reads.
- Client caches may reduce duplicate work but are never an authorization source.
- No production data, Rules, migration, or deployment changes.
- C5.8 is VERIFIED.

### S5-D-C-C.5.9 — Dashboard ALL Scalar Aggregation — 2026-09-04
- Implemented and contract-tested ALL scalar aggregation for ADMIN/DEPUTY/SELLER and the exact two-scope SUPERVISOR union with document-ID de-duplication.
- Cost gate validates pagination/query-count behavior with a synthetic 205-assigned / 80-own fixture; emulator cost tests do not claim billed production pricing.
- No Firestore Rules changes, production writes, migrations, deletes, or deployments.
- C5.9 functional contract is VERIFIED; cost-gate Windows validation remains a prerequisite for final closure if not yet recorded locally.

### S5-D-C-C.5.10 — Dashboard ALL Scalar Aggregation Wiring — 2026-09-04
- Wired verified ALL scalar aggregation into Dashboard KPI cards only.
- Kept document-level `filteredOrders` for charts and analyses requiring order documents.
- Added loading/error handling and safe fallback when aggregation is unavailable or incomplete.
- No Firestore Rules, production data, migrations, deletes, or deployments changed.
- C5.10 is VERIFIED only after the Windows validation gate is recorded.

### S5-D-C-E0 — Dual Role Multi-Context Design — 2026-09-04
- Design-only validation passed for one Firebase Auth account with multiple declared role contexts.
- Workspace is UI/session state only and never an authorization source.
- Existing `role`, `parentId`, and `parentIds` compatibility is preserved.
- No production Firestore reads/writes/deletes, migrations, Rules changes, or deployment.
- E0 is CLOSED / VERIFIED.

### S5-D-C-E1 — Dual-role Data/Auth Foundation — 2026-09-04
**Status: IMPLEMENTED — PENDING WINDOWS VALIDATION**
- Establishes `WorkspaceRole`, `RoleContext`, and `AuthorizationProfile.roles[]` while retaining legacy primary `role`.
- Normalizes optional `roles[]` from the UID-keyed authorization profile without creating a second Firebase Auth account.
- Keeps workspace selection in React memory only; E1 does not activate non-primary authorization scope under the current Rules.
- Preserves `parentId` / `parentIds` compatibility without adding a seller-document read to authorization-profile resolution.
- No Firestore Rules changes, production writes, migrations, deletes, or deployment.
- Gate: E1 foundation validator, TypeScript, build, S2 Rules regression, S3 financial regression, and zero production writes/deletes.

## S5-D-C-E2 — Dual-role Firestore Authorization — 2026-09-04
**Status: IMPLEMENTED — PENDING WINDOWS VALIDATION**
- Upgrades Firestore authorization helpers to recognize legitimately declared `roles[]` capabilities while retaining legacy primary `role` compatibility.
- Preserves Firebase UID and `/users/{uid}` as the identity/authorization boundary; active workspace is never an authorization source.
- Adds/retains dual-role adversarial tests for own seller scope, managed supervisor scope, cross-supervisor denial, query boundaries, and self-escalation denial.
- No production Firestore writes, deletes, migrations, Auth changes, or deployment.
- No automatic role assignment or role migration.
- Gate: E2 static validator, TypeScript, build, S2 Rules regression, S3 financial regression, and E2 adversarial emulator tests; production operations must remain 0.

## S5-D-C-E3 — Dual Workspace Runtime — 2026-09-04
**Status: IMPLEMENTED — PENDING WINDOWS VALIDATION**
- Workspace switching now rebinds the scoped Firebase listeners through `DatabaseService.switchWorkspace` before exposing the new active workspace.
- The transition temporarily gates the workspace UI with `workspaceReady=false`, preventing stale previous-workspace state from being treated as current.
- Firebase-initialized cache access no longer reloads localStorage when a scoped cache is empty, preventing stale cross-workspace data fallback.
- Same Firebase Auth session/UID is retained; no second Auth account, migration, production writes, deletes, or Rules changes.
- Gate: E3 runtime validator, runtime static tests, TypeScript, build, S2/S3 regression, Rules hash, and zero production mutations.

## S5-D-C-E3 — Dual Workspace Runtime — VERIFIED — 2026-09-04
- Windows gate passed: E3 static validator 8/8, runtime 10/10, lint/build PASS, S2 75/75, S3 10/10, Rules hash R3, no unconditional `allow true`, no workspace authorization source, and no stale Firebase-to-local cache fallback.
- No production writes/deletes/migrations/deployments were performed.

## S6-A — Dependency & Supply-Chain Security Audit — 2026-09-04
**Status: WINDOWS AUDIT PASSED — PENDING FORMAL CLOSURE**
- Establishes a read-only dependency/supply-chain baseline before any dependency upgrade/removal.
- Checks package/lock consistency, browser exposure of admin/server packages, secret-file boundaries, and local admin-script isolation.
- Fresh `npm audit` and reproducible-install verification are required on Windows.
- No dependency versions were changed in S6-A.
- No production Firestore/Auth operations, migration, deletes, Rules changes, or deployment.

## CURRENT GATE
S6-A — RUN WINDOWS DEPENDENCY & SUPPLY-CHAIN AUDIT VALIDATION; DO NOT START ANY NEXT SUB-PHASE UNTIL S6-A IS EXPLICITLY VERIFIED.


## S6-B1 — Production Dependency Boundary
- Status: PENDING WINDOWS GATE
- Scope: remove unused direct `express`; move script-only `firebase-admin` and `dotenv` to `devDependencies` without changing versions or application behavior.
- No `npm audit fix --force`, no Firebase major upgrade, no Rules/data/Auth changes.
- Required: regenerate lockfile with `npm install --package-lock-only --ignore-scripts`; compare `npm audit --omit=dev` against S6-A baseline; run S2/S3/lint/build.
- Current gate: S6-B1.

### S6-B2-C — Remove Unused @google/genai
- Status: IMPLEMENTED — PENDING WINDOWS GATE
- Controlled removal only; no source, Rules, Auth, data, or migration changes.
- Baseline production audit before removal: 8 vulnerabilities (5 moderate, 3 high).
- Evidence: no application usage found.
- Protocol: `S6B2C_GOOGLE_GENAI_REMOVAL_PROTOCOL.md`.
- Gate requires dependency absence, normalized lockfile, audit comparison, S2 75/75, S3 10/10, lint/build, and unchanged Rules hash.

### CURRENT GATE
S6-B2-C — WINDOWS VALIDATION PENDING.


### S6-B2-D1 — Build Dependency Boundary
- Status: IMPLEMENTED — PENDING WINDOWS GATE.
- Moved build-only `vite`, `@vitejs/plugin-react`, and `@tailwindcss/vite` from production dependencies to devDependencies.
- No source, Auth, Rules, data, migration, or production operation changes.
- Baseline before D1: 5 production vulnerabilities (3 high, 2 moderate).
- Protocol: `S6B2D1_BUILD_DEPENDENCY_BOUNDARY_PROTOCOL.md`.

### CURRENT GATE
S6-B2-D1 — WINDOWS VALIDATION PENDING.

### S6-B2-D2 — DOMPurify Security Remediation
- Status: IMPLEMENTED — PENDING WINDOWS GATE.
- Added explicit production `dompurify` dependency at `^3.4.14` to constrain jsPDF's optional sanitizer to a patched release.
- Preserves `jspdf@4.2.1` and existing PDF generator behavior; no source/Auth/Rules/data/migration changes.
- Baseline before D2: 2 production vulnerabilities (2 moderate, 0 high) after D1.
- Protocol: `S6B2D2_DOMPURIFY_SECURITY_PROTOCOL.md`.
- Gate requires normalized lockfile, patched resolved DOMPurify, audit comparison, PDF generator preservation, S2 75/75, S3 10/10, lint/build, and unchanged Rules hash.

### CURRENT GATE
S6-B2-D2 — WINDOWS VALIDATION PENDING.

### S6-B2-D3 — protobufjs Security Remediation
- Status: IMPLEMENTED — PENDING WINDOWS GATE.
- Controlled transitive dependency remediation only; target patched supported protobufjs 7.x without major migration.
- Baseline before D3: 1 production vulnerability (1 moderate, 0 high, 0 critical) after D2; current lock resolves protobufjs 7.6.4 through `@grpc/proto-loader`.
- Protocol: `S6B2D3_PROTOBUFJS_SECURITY_PROTOCOL.md`.
- Gate requires npm lock normalization, patched protobufjs resolution (>=7.6.5 on 7.x), no direct app import, audit comparison, S2 75/75, S3 10/10, lint/build, and unchanged Rules hash.

### S6-B2-D3-R1 — Controlled protobufjs Resolution
- Status: IMPLEMENTED — PENDING WINDOWS GATE.
- D3 Gate confirmed the real production path `firebase -> @firebase/firestore -> @grpc/proto-loader -> protobufjs@7.6.4`; `npm install --package-lock-only` did not move it because the existing transitive ranges permit 7.6.4.
- Added root npm override `protobufjs: 7.6.6` to force a patched supported 7.x release without adding protobufjs as a direct application dependency and without moving to major 8.x.
- No source, Auth, Firestore Rules, production data, migration, or application behavior changes.
- Protocol: `S6B2D3_R1_PROTOBUFJS_RESOLUTION_PROTOCOL.md`.
- Gate requires successful lock resolution, installed protobufjs 7.6.6 (or explicitly approved patched 7.x), no invalid tree, protobufjs advisory absent from production audit, S2 75/75, S3 10/10, lint/build, and unchanged Rules hash.

### CURRENT GATE
S6-B2-D3-R1 — WINDOWS VALIDATION PENDING.

### S6-C1 — Production Mock / Local Data Removal
- Status: IMPLEMENTED — WINDOWS GATE FAILED ON STALE E3 REGRESSION ASSERTION; C1-R1 TEST CORRECTION READY.
- Removed obsolete hardcoded local Admin/seller/product/order database defaults and local database persistence helpers from `src/dbMock.ts`.
- Production database path is now Firestore-only; database operations fail closed when Firebase is not configured.
- Retained in-memory Firestore cache and scoped workspace listeners.
- Retained `safeStorage.ts` for non-sensitive UI state only; it is not a database or authorization source.
- Deferred legacy UID-linked seller profile compatibility audit to S6-C2.
- No Firestore Rules, Auth, production data, migration, or dependency changes.
- Protocol: `S6C1_PRODUCTION_MOCK_REMOVAL_PROTOCOL.md`.
- Validator: `scripts/s6c1-production-mock-removal-validate.mjs`.

### CURRENT GATE
S6-C1-R1 — WINDOWS VALIDATION PENDING AFTER TEST-ONLY REGRESSION ASSERTION CORRECTION.

### S6-C2 — Legacy Authentication/Profile Compatibility Audit
- Status: IMPLEMENTED — WINDOWS AUDIT GATE PENDING.
- Scope: audit remaining legacy seller UID/profile compatibility before any removal.
- Canonical model: Firebase Auth UID -> `/users/{uid}` authorization profile -> `sellerId` -> canonical `/sellers/{sellerId}`.
- Current legacy paths retained intentionally for audit: `sellers where uid == authenticatedUid` and direct `/sellers/{uid}` lookup.
- No migration, production write/delete, Auth mutation, Rules change, order change, or dependency change.
- Protocol: `S6C2_LEGACY_PROFILE_COMPATIBILITY_AUDIT_PROTOCOL.md`.
- Static validator: `scripts/s6c2-legacy-profile-compatibility-validate.mjs`.
- Read-only production reconciliation: `scripts/s6c2-legacy-profile-audit.mjs` using explicit `GOOGLE_APPLICATION_CREDENTIALS`; it never writes/deletes or mutates Auth.
- Gate requires static validation plus read-only production linkage report review before any legacy path is removed.

### CURRENT GATE
S6-C2 — WINDOWS STATIC + READ-ONLY LEGACY PROFILE AUDIT PENDING.

### S6-C3-B — Production Data Exposure / Schema Audit
- Status: TOOLING IMPLEMENTED — WINDOWS READ-ONLY AUDIT PENDING.
- Scope: inspect production field names/types and bounded samples for `settings/sheetsConfig`, `syncLogs`, `notifications`, `products`, `sellers`, and `orders`.
- Safety: Admin SDK read-only; aggregate counts plus maximum 3 sampled documents per collection; no document values printed; no Firestore writes/deletes; no Auth mutations; no Rules changes.
- Protocol: `S6C3B_PRODUCTION_SCHEMA_AUDIT_PROTOCOL.md`.
- Tool: `scripts/s6c3b-production-schema-audit.mjs`.

### S6-C3-B-R1 — Legacy Password Field Forensics
- Status: VERIFIED — READ-ONLY PRODUCTION FORENSICS PASS.
- Production result: 14/14 seller documents contain a non-empty `password` string; 14/14 classified as short-plaintext-like; 0 bcrypt/Argon2/long-hash-like; 13 unique values with 1 duplicate-value group.
- Safety result: password values/fingerprints were not printed; Firebase Auth passwords were not accessed; Firestore writes/deletes 0; Auth mutations 0.
- Decision: do not delete or rewrite the production field at this gate. First verify all current source dependencies.
- Protocol: `S6C3B_R2_LEGACY_PASSWORD_DEPENDENCY_AUDIT_PROTOCOL.md`.
- Tool: `scripts/s6c3b-r2-legacy-password-dependency-audit.mjs`.

### CURRENT GATE
S6-C3-B-R2 — WINDOWS STATIC LEGACY PASSWORD DEPENDENCY AUDIT PENDING.

### S6-C3-B-R2 — Legacy Password Dependency Audit
- Status: VERIFIED — STATIC READ-ONLY PASS.
- Result: current authentication uses Firebase Auth; `AuthService` does not read/query/compare `sellers.password`; local DB does not persist password data; no current AuthService account creation path depends on the legacy field.
- Four findings in `LoginScreen.tsx` are login UI/Firebase Auth error handling and are not `sellers.password` dependencies.
- Protocol: `S6C3B_R2_LEGACY_PASSWORD_DEPENDENCY_AUDIT_PROTOCOL.md`.
- Tool: `scripts/s6c3b-r2-legacy-password-dependency-audit.mjs`.

### S6-C3-B-R3 — Legacy Password Field Removal Dry-Run
- Status: IMPLEMENTED — WINDOWS READ-ONLY DRY-RUN PENDING.
- Scope: prepare a deterministic baseline for deleting only the legacy `sellers.password` field; never delete seller documents.
- Safety: Firestore Admin SDK reads only; zero Firestore writes/deletes; zero Auth mutations; password values/fingerprints are never printed or stored.
- Baseline: per-seller SHA-256 hash of document content excluding `password`, plus target field metadata. The generated local report is `artifacts/s6c3b-r3-password-removal-dry-run.json`.
- Future execution requirement: re-read and compare baseline hash; skip/abort changed documents; delete only the field; re-read and reconcile. Execution requires separate explicit approval.
- Protocol: `S6C3B_R3_PASSWORD_FIELD_REMOVAL_DRY_RUN_PROTOCOL.md`.
- Tool: `scripts/s6c3b-r3-password-removal-dry-run.mjs`.

### S6-C3-B-R4 — Legacy Password Field Removal Execution
- Status: READY — EXPLICIT PRODUCTION EXECUTION SCRIPT PREPARED; NOT YET RUN.
- Scope: remove only `sellers.password` from the 14 validated seller documents.
- Preconditions: R1, R2, and R3 verified; R3 baseline must exist locally.
- Safety: exact seller count/ID set and non-password SHA-256 fingerprints are revalidated before writes; Firestore document `updateTime` is used as a write precondition; field-only deletion; no document deletes/recreates; no Auth mutations.
- Reconciliation: re-read all sellers and verify unchanged non-password fingerprints and zero remaining `password` fields.
- Protocol: `S6C3B_R4_PASSWORD_FIELD_REMOVAL_EXECUTION_PROTOCOL.md`.
- Tool: `scripts/s6c3b-r4-password-field-removal-execute.mjs`.

### CURRENT GATE
S6-C3-B-R4 — EXPLICIT PRODUCTION EXECUTION READY; PENDING USER-RUN.

## S6-C3-B-R5 — Sensitive Data Exposure & Read-Scope Audit
- Status: OPEN / READ-ONLY.
- Purpose: classify production sensitive fields and authorization/read scope before any repair.
- No Rules changes, writes, deletes, Auth mutations, or data migrations in R5.
- Audit sellers/products/orders/notifications/syncLogs/settings and identify unnecessary exposure/read cost.
- Gate: successful bounded production audit, zero writes/deletes/Auth mutations, no sensitive values printed, findings reviewed and explicitly approved before repair.
