# SellerPro S6-D2-E1 — Product Assignment / Supervisor Product Scope

Status: IMPLEMENTATION PATCH — no production Firestore writes performed.

Implemented in this patch:
- `Product.supervisorIds?: string[]` added to the TypeScript model.
- Product realtime reads now use a Rules-compatible supervisor query:
  `where('supervisorIds', 'array-contains', authenticated supervisor sellerId)`.
- Admin/deputy retain management-wide product reads.
- Seller read scope remains unchanged in this first implementation slice.
- Admin/deputy product form can assign one or more active supervisors.
- Supervisor product updates cannot change `supervisorIds` in Rules.
- Product assignment list is bounded to 20 IDs.
- Assignment IDs are seller IDs, not Firebase Auth UIDs.
- No migration, no production data writes, no deletion.

Important:
- This patch is intentionally limited to Feature A / the first E1 slice.
- Multi-product orders and settlement sessions are NOT implemented here.
