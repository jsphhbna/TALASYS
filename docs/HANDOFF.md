# TALASYS Remediation Handoff

## Current state — 2026-10-14

Working branch: `main`. Baseline reviewed: `0bac62c8fc491a643b5bdc4fafd64391dd47d434`.

The remaining identity concurrency defects, unified coordination boundary, and end-to-end browser workflows have been repaired and verified locally.

**Scope change & historical migration status:**
"Not required for the user’s planned fresh-data reset; no deletion or migration performed."
No production deployment, production Firestore rules publication, production account mutation, or historical data deletion was performed.

## Implemented in this pass

- **Task 1 — Auth Compensation Race Reproduction (`test/identity-compensation-race.test.ts`)**:
  - Deterministically reproduced the race where Attempt A verified lock ownership, paused before Auth compensation write, Attempt B completed identity update, and Attempt A proceeded to overwrite Auth with the old email, leaving Firestore with `newb@example.test` and Auth with `old@example.test`.
  - Verified repaired coordinator prevents Attempt B takeover during active compensation and fences Attempt A compensation.
- **Tasks 2 & 3 — Unified Resident Coordination Boundary & Stale Auth Elimination (ADR-013)**:
  - Unified all resident identity writers (`lib/admin/identity-email-operation.ts`, `lib/admin/verification-approval.ts`, `/api/admin/update-resident-email`, `/api/admin/verifications/approve`) under the single resident lock boundary: `identityOperationLocks/${residentId}`.
  - Implemented multi-stage lock state machine: `claimed` -> `auth-mutating` -> `auth-completed` -> `completed` / `compensating` -> `compensated` / `reconciliation-required`.
  - Completely eliminated timeout-based lock stealing during in-flight operations.
  - Added lost Auth response recovery via `getAuthEmail` before assuming mutation failure.
  - Added fenced backward compensation: if ownership was lost or Auth state drifted, lock transitions to `reconciliation-required` rather than blindly reverting Auth.
  - Implemented dedicated operator reconciliation service (`lib/admin/identity-reconciliation.ts`, `POST /api/admin/reconcile-identity`) with audit logging.
  - Verified with 10/10 acceptance tests in `test/identity-coordination-acceptance.test.ts`.
- **Tasks 4 & 5 — Authenticated Browser Workflows & Fresh Data Verification (`test/e2e/authenticated-workflows.spec.ts`)**:
  - Expanded authenticated Chromium suite from 12 to 22 tests against live Firebase Auth and Firestore emulators.
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

