# S6-D2-E3-D — Trusted Order Write Architecture

## Decision

Modern and legacy order creation/update operations are moved out of the browser Firestore write path.

The browser sends an authenticated Firebase ID token to `/api/orders`. The server verifies the token and the `/users/{uid}` authorization profile, checks seller/supervisor scope, loads the required product documents, builds the canonical order, recalculates totals/profit, and writes with Firebase Admin SDK.

## Why this replaces the Rules expression-loop approach

Firestore Security Rules are excellent for document/query authorization, but they are not a scalable place to iterate over many product snapshots and recompute multi-item financial formulas. The previous 8-item implementation already hit the Rules expression budget.

The new boundary keeps Rules responsible for read/query authorization and explicitly denies direct browser order create/update. The trusted API becomes the single order-write policy point.

## Security invariants

- Firebase Authentication remains the identity source.
- The server never trusts client-supplied product name or prices.
- Product snapshots are rebuilt from current product documents at creation time.
- Modern order snapshots are immutable after creation.
- Modern order quantities may be changed only by management roles; totals/profit are always recomputed server-side.
- SELLER cannot update an order after creation.
- Seller and supervisor scope is checked server-side.
- `createdByUid` and `sellerId` cannot be reassigned during update.
- `updatedAt` is an optimistic concurrency version; stale writes are rejected.
- Direct Firestore client create/update of orders is denied by Rules.
- The item limit is centralized at 50 and can be raised later after document-size/load testing.

## Required server environment

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

These are server-only variables. They must never use the `VITE_` prefix and must never be committed to source control.

## Validation performed before packaging

- Trusted order logic test: PASS.
- 8-product creation logic: PASS.
- 50-product scalability logic: PASS.
- Duplicate-product rejection: PASS.
- Delivery/profit calculation: PASS.
- Snapshot immutability: PASS.
- Seller update lock: PASS.
- Concurrency version check: PASS.
- API modules pass Node syntax checks.
- Firestore client order create/update calls are no longer present in `FirestoreService`.
- `package-lock.json` SHA-256 remains unchanged.

The Firestore emulator integration still needs to be run in the user's project after the package is installed/applied because the uploaded archive does not contain `node_modules`.
