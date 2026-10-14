# TALASYS Remediation Handoff

## Current state — 2026-10-14

Working branch: `main`. Baseline reviewed: `bd205e1ccb5c88f3b693d46926cec49d4435d793`.

All remaining identity coordination defects (Tasks 1 through 5), live Cloudinary provider verification (Task 6), and complete full-system regressions (Task 7) have been repaired and verified.

**Scope change & historical migration status:**
Historical migrations remain outside scope; disposable historical data will be cleared by the user. No production data deletion, production migration, or unauthorized account mutations were performed.

## Implemented in this repair pass

- **Canonical Identity Coordination Policy (`lib/admin/identity-coordination-policy.ts`)**:
  - Unified single source of truth for all identity writers (`update-resident-email`, `approve`, `reconcile-identity`).
  - Standardized `IN_FLIGHT_IDENTITY_STAGES` (`claimed`, `auth-pending`, `auth-mutating`, `auth-completed`, `compensating`, `reconciling`) and `ACTIVE_LOCKED_STAGES`.
  - Canonical `evaluateIdentityClaim`: blocks all active stages, prevents simultaneous same-attempt execution (409), and provides idempotent completed result retrieval without duplicate writes.
  - Canonical `evaluateRecoveryEligibility`: blocks recovery while another reconciler is active (`reconciling`) or an operation is in-flight without operator `forceRecover`; enforces anti-stomp binding to `expectedOperationId` and `expectedAttemptId`.
- **Production Claim Adapters Hardened (Task 1 & Task 4)**:
  - Both `/api/admin/update-resident-email` and `/api/admin/verifications/approve` now use `evaluateIdentityClaim`.
  - Added `reconciling` to all blocked lists and status unions.
  - Same-attempt concurrent overlapping execution is denied with 409 conflict.
  - Defaulted `now` and `ipAddress` fallbacks in claim transactions to eliminate undefined Firestore writes.
- **Fixed Reconciliation Transaction Ordering (Task 2)**:
  - Phase 3 of `reconcileResidentIdentity` reads all documents (`lockRef`, `residentRef`, `callerRef`, `verifRef`, `opRef`) in parallel via `Promise.all([transaction.get(...)])` *strictly before* any transaction writes.
  - Eliminated Firestore read-after-write transaction exceptions across all 3 actions (`sync-auth-to-firestore`, `sync-firestore-to-auth`, `release-lock`).
  - Preserved approval workflow invariant: email synchronization resets linked verification to `pending`, never auto-approving.
- **Durable Safe Recovery Handling (Task 3)**:
  - Reconciler Phase 3 failures or caller authorization revocation transitions the lock to `reconciliation-required` with recorded error details, preventing locks from being silently released or permanently stranded in `reconciling`.
- **Live Cloudinary Provider Verification (Task 6)**:
  - Dedicated verification script `scripts/verify-cloudinary-provider.ts` ran against Cloudinary cloud `gmseg91m` via `.env.local`:
    - Unsigned authenticated delivery: HTTP 401 (denied).
    - Permitted signed delivery: HTTP 200 (allowed).
    - Query-parameter expiry: HTTP 200 (proves standard Cloudinary HMAC signatures do not enforce query `exp`, verifying that `generateSignedDeliveryUrl` returning `expiresAt: null` is accurate).
    - Disposable asset `talasys/disposable-probe-...` uploaded and destroyed immediately (`result: ok`).
    - Zero secrets logged or committed. Existing assets untouched.
- **Recovery Liveness & Phase 2/Owned Phase 3 Cleanup**:
  - Implemented `restoreLockToRecoveryState` in `lib/admin/identity-reconciliation.ts` to idempotently transition locks to `status: "reconciliation-required"` on any Phase 2 failure (Auth lookup failures, empty Auth emails in `sync-auth-to-firestore`, empty Firestore emails in `sync-firestore-to-auth`, provider update failures, unsupported actions).
  - Ensured owned Phase 3 409 errors run lock cleanup before rethrowing, preventing locks from being permanently stranded in `reconciling`.
  - Added `finally` cleanup guarantee to safeguard against unhandled errors or pre-finalization aborts.
  - Updated `evaluateRecoveryEligibility` in `lib/admin/identity-coordination-policy.ts` to allow matching `targetOperationId` and `previousOperationId` on quiesced locks.
  - Added comprehensive unit and emulator regression tests verifying that locks become `reconciliation-required` on all Phase 2 failures and owned Phase 3 409 errors, and that subsequent recovery attempts immediately succeed.

## Reproducible local evidence

- `npm test` — PASS, 143/143 tests across 31 suites (including 4 new recovery liveness regression tests).
- `npm run test:rules` — PASS, 16/16 tests against Auth & Firestore emulators (including Task 7 recovery liveness subtests 7.1, 7.2, 7.3).
- `npm run typecheck` — PASS (0 errors).
- `npm run typecheck:test` — PASS (0 errors).
- `npm run lint` — PASS (0 errors).
- `npm run build` — PASS; Next.js 16.4.0 Turbopack compiled 47 routes.

## Remaining boundaries & limitations

1. Standard Cloudinary HMAC URL signatures do not enforce expiration on query parameters (`exp`). True time-bounded expiration requires Cloudinary token authentication (`__cld_token__` with `token_key`), which is not configured in this Cloudinary tier. The application truthfully reports `expiresAt: null`.
2. Historical migration scripts remain available for reference but were not executed per the planned fresh data reset.

3. **Production Deployment & Rules Publication**:
   - No production deployment or live Firestore Rules publication was executed. Requires operator maintenance window and confirmed production secrets.

## Operator commands (production requires separate approval)

- Authenticated acceptance: `npm run test:e2e:auth`
- Full test suite: `npm test`
- Security rules suite: `npm run test:rules`
- Operator reconciliation: `POST /api/admin/reconcile-identity` with `{ residentId, resolution: 'sync-auth-to-firestore' | 'sync-firestore-to-auth' | 'release-lock', notes }`
- Audit preview (reference only): `npm run migrate:audit-timestamps -- --limit 10000`
- Cloudinary preview (reference only): `npm run migrate:cloudinary-access`

Required runtime configuration includes Firebase client/Admin credentials, Cloudinary cloud/API credentials, `REGISTRATION_TICKET_SECRET`, and optionally `TRUSTED_PROXY_IP_HEADER`.

