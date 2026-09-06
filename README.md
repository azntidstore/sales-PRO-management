# E3-G-E — Settlement / Invoice / Archive Validation

- Session close now stores canonical delivered-order sales as settlementAmount.
- Closed sessions contain an immutable invoice snapshot.
- Closed-session archive retrieval is restricted to ADMIN/DEPUTY through the trusted API.
- Direct Firestore browser access to settlementSessions is denied.
- Added composite indexes for session lookup and session-scoped order aggregation.
- No migration, deletion, or persistent listener.
