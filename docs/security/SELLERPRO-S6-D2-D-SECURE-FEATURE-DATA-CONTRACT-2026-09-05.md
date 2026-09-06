# SELLERPRO — S6-D2-D Secure Feature Data Contract
Date: 2026-09-05
Mode: DESIGN ONLY / NO PRODUCTION MIGRATION / NO FIRESTORE WRITES

## 1. Purpose

This document freezes the security/data contract for the next four features before implementation:

1. Product-to-supervisor assignment
2. Supervisor-filtered product selection
3. Multi-product order in one window with one delivery cost per order
4. Seller settlement sessions with admin/deputy archive and immutable closed sessions

The existing S2/S3/S5/S6 controls remain authoritative. This phase does not modify production data.

## 2. Existing security baseline to preserve

- Firebase Auth remains the only authentication source.
- `/users/{firebaseUid}` remains the authorization profile.
- Client workspace role is UI context only.
- Firestore Rules remain the authorization boundary.
- Financial snapshots remain historical and must not be client-editable after creation.
- `wholesalePrice` remains visible to SELLER by existing business design.
- No service-account credentials in source/frontend.
- No migration is allowed for these features.
- No destructive archive by moving/deleting production orders.
- Prefer bounded, role-scoped Firestore queries over read-all/client filtering.

## 3. Feature A — Product assignment

### Canonical product field

Add only after implementation approval:

`supervisorIds: string[]`

Meaning: seller IDs of supervisors responsible for this product.

Rules:
- ADMIN/DEPUTY may assign/unassign supervisors.
- SUPERVISOR may not grant itself or another supervisor access.
- SELLER cannot modify assignment.
- Empty list means no supervisor-specific assignment.
- IDs must be valid seller IDs and preferably resolve to active SUPERVISOR profiles.
- Do not use product names as authorization identifiers.

### Read boundary

Current rules allow every active role to read every product. That is not sufficient for supervisor-only product visibility.

Target:
- ADMIN/DEPUTY: all active products.
- SUPERVISOR: only products where `supervisorIds` contains their `sellerId`.
- SELLER: product visibility must follow the approved business policy; it must not rely on React filtering.

The implementation must use Firestore queries compatible with Rules. Never fetch the complete product collection and then hide unauthorized products in React.

## 4. Feature B — Supervisor-filtered product selection

The UI must consume an already-authorized product query.

Required invariant:

`visibleProducts(SUPERVISOR) == products where supervisorIds array-contains currentSupervisorSellerId`

The client may further filter the authorized result by active/search/status, but may not expand its authorization scope.

Product authorization must hold for:
- collection queries
- direct document reads
- attempted unauthorized product access

Tests must include:
- supervisor reads assigned product: PASS
- supervisor reads unassigned product: DENY
- supervisor query without matching scope: DENY
- admin/deputy management access: PASS
- seller unauthorized assignment mutation: DENY

## 5. Feature C — Multi-product order

### Recommended document shape

Keep the order as one Firestore document to minimize reads/writes and preserve atomic order creation.

Introduce a bounded `items` list. Each item contains:

- `productId`
- `productNameSnapshot`
- `wholesalePriceSnapshot`
- `sellingPriceSnapshot`
- `quantity`
- `lineTotal`

Order-level fields remain:

- `deliveryCost`
- `totalAmount`
- `profit`
- `orderStatus`
- `sellerId`
- `createdByUid`
- `assignedSupervisorId`
- customer/order identity fields

### Critical security constraint

Firestore Rules cannot safely treat an arbitrary client-calculated aggregate as authoritative without explicit validation.

Therefore implementation must choose one of these two safe approaches before coding:

A. Bounded items with explicit Rules validation for every permitted item slot.

OR

B. Introduce a trusted backend/server computation boundary that creates/updates financial aggregates.

Given the current architecture and Firebase free-plan objective, prefer A only if a strict maximum item count can be accepted and the Rules remain maintainable. Otherwise use B rather than weakening financial integrity.

Do NOT implement an unbounded `items[]` list with client-only total/profit trust.

### Financial invariants

For every item:

`lineTotal = sellingPriceSnapshot * quantity`

Order:

`itemsSubtotal = sum(lineTotal)`

`totalAmount = itemsSubtotal + deliveryCost`

Delivered:

`profit = totalAmount - deliveryCost - sum(wholesalePriceSnapshot * quantity)`

Non-delivered:

`profit = 0`

`deliveryCost` is charged once per order, never once per item.

Historical snapshots must remain immutable for an existing product line.

Every product referenced by a new order must be authorized for the acting role and must have current product snapshots at creation.

## 6. Feature D — Seller settlement sessions

### Logical collection

`settlementSessions/{sessionId}`

Proposed fields:

- `id`
- `sellerId`
- `status: OPEN | CLOSED`
- `openedAt`
- `openedByUid`
- `closedAt`
- `closedByUid`

Orders reference:

`sessionId`

### Authority

SELLER:
- may operate only inside their own OPEN session
- may not close/archive a session unless business policy explicitly grants it
- may not edit a CLOSED session
- may not change an order from one closed session to another

ADMIN/DEPUTY:
- management access
- may close sessions
- may access historical sessions
- archive operation must be logical, not destructive

SUPERVISOR:
- scope according to seller management relationship
- must not gain archive/delete authority merely from supervisor status

### Closed-session invariant

Once:

`status == CLOSED`

the session and all finalized financial/order linkage must become immutable.

Rules must enforce this, not merely disable UI controls.

## 7. Archive policy

Do not physically move/delete orders to an archive collection.

Use logical lifecycle fields such as:

`archivedAt`
`archivedByUid`

only where required by the approved workflow.

Deletion remains separately authorized and must not be used as the normal settlement/archive mechanism.

## 8. Read/write cost design

Because the application targets the Firebase free plan:

- Do not add a permanent listener for every session/order aggregate.
- Use existing role-scoped order queries.
- Prefer one order document containing bounded items over many item documents when Rules can validate it safely.
- Do not perform read-all-then-filter for products.
- Use `array-contains` for supervisor product scope where appropriate.
- Keep settlement session metadata in one document.
- Calculate presentation aggregates from already-authorized bounded order reads unless a trusted aggregate is later introduced.
- Avoid duplicating the same order into archive collections.

## 9. Role matrix

| Operation | ADMIN | DEPUTY | SUPERVISOR | SELLER |
|---|---|---|---|---|
| Read all products | YES | YES | NO | policy-scoped |
| Assign product supervisors | YES | YES | NO | NO |
| Read assigned products | YES | YES | YES | policy-scoped |
| Create own order | YES | YES | YES | YES |
| Create order for subordinate seller | YES | YES | YES within scope | NO |
| Modify another supervisor's order | NO | YES | NO | NO |
| Close seller session | YES | YES | policy-scoped | NO by default |
| Modify CLOSED session | NO | NO | NO | NO |
| Destructive archive/delete | management rules only | management rules only | existing scoped delete only; not archive workflow | NO |

The exact final role matrix must be encoded in Rules tests before feature release.

## 10. Required implementation gates

Before any production feature code is approved:

1. Static schema/type audit.
2. Firestore Rules design review.
3. Query compatibility review.
4. Emulator authorization tests.
5. Financial tampering tests.
6. Closed-session immutability tests.
7. Product assignment escalation tests.
8. Multi-product aggregate tampering tests.
9. Lint.
10. Build.
11. Read/write cost review.
12. Only then production rollout.

## 11. Explicit non-goals

This phase does NOT:
- migrate existing orders
- modify existing products
- create settlement sessions in production
- change existing Rules
- delete data
- introduce service-account credentials
- weaken existing S2/S3/S5 protections

## 12. S6-D2-D exit criteria

PASS requires:
- schema contract documented
- authorization boundary documented
- query strategy documented
- financial model documented
- session immutability documented
- archive strategy documented
- free-plan read/write strategy documented
- no production mutation performed

Status: DESIGN CONTRACT READY — awaiting explicit approval for implementation planning.
