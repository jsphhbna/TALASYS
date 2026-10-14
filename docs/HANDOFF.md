# TALASYS Remediation Handoff

## Current state — 2026-10-14

Working branch: `main`. Baseline reviewed: `27e5726b2615c1545ee0c8b28565c9e5eb7f723e`.

The remaining identity consistency defects, claim adapter stage protections, reconciliation service isolation, and test suite execution have been fully repaired and verified locally.

**Scope change & historical migration status:**
"Not required for the user’s planned fresh-data reset; no deletion or migration performed."
No production deployment, production Firestore rules publication, production account mutation, or historical data deletion was performed.

## Implemented in this repair pass

- **Identity Compensation Race Scoping Repair (`test/identity-compensation-race.test.ts`)**:
  - Repaired variable scoping error where `firestoreEmail` was referenced outside its declaring test scope.
  - Confirmed both race reproduction and repaired coordinator tests pass deterministically.
- **Production Claim Adapter Stage Protections (D1)**:
  - Repaired `/api/admin/update-resident-email` and `/api/admin/verifications/approve` claim adapters.
  - Enforced that competing attempts on the same operationId are rejected during ALL active/unresolved lock stages (`claimed`, `auth-pending`, `auth-mutating`, `auth-completed`, `compensating`, `reconciliation-required`), not merely during `auth-mutating`.
- **Identity Reconciliation Hardening (D2–D7)**:
  - Re-architected `reconcileResidentIdentity` (`lib/admin/identity-reconciliation.ts`):
    - **Transaction Isolation**: Auth mutation (`updateUser`) is now executed outside Firestore `runTransaction` callback, eliminating duplicate Auth writes on transaction retries.
    - **Authoritative Approval Safeguard**: Syncing emails no longer auto-approves linked verifications. Verifications are cleanly reset to `pending` so they proceed through standard authoritative multi-step verification approval.
    - **Lock State Verification**: Reconciler validates that the lock is quiesced and not actively in-flight (`claimed`, `auth-mutating`, `auth-completed`, `compensating`) before intervening.
    - **Collision-Resistant Idempotency & Audit**: Accepts or generates unique `reconciliationId` for replay idempotency and writes non-colliding audit log document IDs (`reconcile-${residentId}-${reconciliationId}`).
    - **Endpoint Alignment**: `POST /api/admin/reconcile-identity` accepts both `action` and `resolution` parameter names, forwards `reconciliationId`, and logs client IP.
- **Acceptance Suite Matrix Expansion (`test/identity-coordination-acceptance.test.ts`)**:
  - Enhanced retry race acceptance test to assert rejection of competing attempts across all six active/unresolved stages.
  - Updated operator recovery mock to track full lock document state including attempt fences.
  - Resolved TypeScript literal comparison check with strict typed variable annotation.
- **Tasks 4 & 5 — Authenticated Browser Workflows & Fresh Data Verification (`test/e2e/authenticated-workflows.spec.ts`)**:
  - Authenticated Chromium suite: 22 tests against live Firebase Auth and Firestore emulators.
  - Verified resident document request creation via actual modal/portal UI (`/resident/request` -> `POST /api/resident/requests/create` -> `/resident/history`).
  - Verified profile-edit approval with email change updating both Auth and Firestore.
  - Verified injected identity failure yields 409 conflict/incomplete toast in UI rather than false success.
  - Verified safe retry without duplicate audit/notification records.
  - Verified role boundaries: Verification Only restricted to verification workspace; View Only and Document Processing forbidden from mutating identity; Locked accounts denied mutation.
  - Verified reactivation workflow restoring `Active` status and validity period.
  - Verified protected media: authenticated signed delivery URLs for authorized owners and admins; 403 denial for unauthorized users without leaking raw asset URLs; UI SecureMediaViewer integration.
  - Verified new-data rules: asset URL theft blocked by server ownership checks; authoritative server pricing overrides client-tampered fee payloads.

## Reproducible local evidence

- `npm test` — PASS, 136/136 tests across 31 suites.
- `npm run test:rules` — PASS, 9/9 rules and migration adapter tests against Firestore Emulator.
- `npm run test:e2e:auth` — PASS, 22/22 authenticated browser tests against Firebase Auth & Firestore emulators.
- `npm run typecheck` — PASS (0 errors).
- `npm run typecheck:test` — PASS (0 errors).
- `npm run lint` — PASS (0 errors).
- `npm run build` — PASS; Next.js 16.4.0 Turbopack compiled 47 routes.
- `npm audit --omit=dev` — PASS high-severity gate (0 high/critical vulnerabilities; 2 moderate in transitive ExcelJS `uuid` GHSA-w5hq-g745-h8pq).
- `npm audit` — 11 high, 5 moderate advisories strictly in development/build tooling (`braces`, `basic-ftp`, `@opentelemetry/core`).

## Remaining production boundaries

1. **Live Cloudinary CDN Enforcement**:
   - Live provider enforcement is unverified because no production Cloudinary credentials or test environment were supplied. Local tests used controlled provider adapters. Live signed delivery, unsigned URL denial, and CDN cache invalidation remain deployment verification items.
2. **Historical Data Status**:
   - Not required for the user’s planned fresh-data reset; no deletion or migration performed. Historical audit/Cloudinary migrations remain documented tools but were not executed.
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

