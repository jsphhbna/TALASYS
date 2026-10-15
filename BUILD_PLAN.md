# TALASYS Audit Findings Remediation Build Plan (A01–A18 & R01–R12)

## Final Registration Lifecycle Remediation & Self-Audit (R09–R12) — active pass

- **Status**: IN PROGRESS on `main` from baseline `26f067bc1939dd3c2b2a86bdcea9efe2329ed8ba`.
- **Target findings**:
  1. **R09 (Pending registration verification deletion bypass)**: Current Firestore Rules permit residents to delete any pending verification, allowing deletion of `type: "registration"` verifications. This bypasses server lifecycle controls, leaving `residentVerificationLocks/{uid}` and `users/{uid}.hasPendingVerification` in an inconsistent state. Deny client deletion of registration verifications; restrict deletion strictly to SuperAdmin and resident withdrawal of unreviewed `profile-edit` and `reactivation` verifications.
  2. **R10 (Cloudinary provider verification fail-closed)**: `app/api/resident/registration/resubmit/route.ts` silently swallows exceptions from `createCloudinaryAssetVerifier()`, making provider checks optional under missing config or initialization errors. Enforce fail-closed behavior, ensuring missing/invalid verifier throws 503 `PROVIDER_VERIFICATION_UNAVAILABLE` or `PROVIDER_VERIFICATION_REQUIRED`, asset lookup failure throws 404, identity mismatch throws 409, and zero Firestore records are written on failure.
  3. **R11 (Idempotent retry verification ID correction)**: In `lib/security/registration-resubmission.ts`, transactional same-operation detection returns `{ idempotent: true }` without `verificationId`, causing the outer return to use a newly generated, uncommitted UUID. Return the stored authoritative `verificationId` from `opData` across all idempotent code paths (pre-transaction, inside transaction, and during transaction retry).
  4. **R12 (Frontend resubmission operation ID preservation)**: `hooks/resident/use-resident-data.ts` does not provide an `operationId`, generating fresh server-side UUIDs on every retry. Generate and preserve a stable operation ID per logical payload attempt in `sessionStorage`, support safe retries across network drops and browser refreshes, guard against duplicate in-flight clicks, and truthfully report results.

| Milestone | Status | Verified Evidence |
|---|---|---|
| M-R09: Rules Verification Deletion Lockdown | VERIFIED | `firestore.rules` updated; resident deletion of registration verifications denied; profile-edit and reactivation withdrawal preserved; 56/56 emulator rules and concurrency tests PASS. |
| M-R10: Provider Verification Fail-Closed | VERIFIED | Resubmit route and `registration-resubmission.ts` fail closed on missing/invalid provider; asset lookup failures fail closed with zero partial Firestore writes; unit and emulator tests PASS. |
| M-R11: Idempotent Resubmission Verification ID | VERIFIED | Authoritative `verificationId` returned from completed operation on concurrent same-operation replays and transaction retries; verified with deterministic concurrency tests. |
| M-R12: Frontend Operation ID & State Recovery | VERIFIED | `use-resident-data.ts` and `resubmission-operation.ts` derive/persist stable operation ID per payload; retries reuse operation ID; duplicate clicks blocked; unit tests PASS 4/4; truthful UI error and success states. |
| M-R-Audit: Adversarial Review & Verification Gate | VERIFIED | Unit tests PASS (163/163), emulator tests PASS (56/56), E2E auth Playwright PASS (24/24), TypeScript app/test (0 errors), ESLint (0 errors, 791 warnings), Build (51/51 routes), Timezone matrix (3 x 6 tests PASS), `git diff --check` clean. |

## Comprehensive Registration & Identity Lifecycle Hardening — prior pass (R01–R08)

- **Status**: IMPLEMENTED, FULLY VERIFIED on `main` at `26f067bc1939dd3c2b2a86bdcea9efe2329ed8ba`.
- **Delivered scope**:
  1. **R01 (Proof Verification)**: Completely eliminated unverified proof submission in `lib/security/registration-resubmission.ts`. Enforced Cloudinary authenticated delivery type, cloud identity matching, caller publicId namespace (`talasys/proofs/${callerUid}/` or `talasys/proofs/registration/`), reservation/claim ownership in `mediaRegistry`, and strict classification-required document validation using `getRequiredDocuments`.
  2. **R02 (Concurrency Protection)**: Implemented transactionally protected mutual exclusion for concurrent resubmissions using `residentVerificationLocks/{residentId}` and `users/{residentId}`. Two concurrent submissions contend on the same lock document; exactly one commits, and the retried competitor immediately aborts with 409 `PENDING_VERIFICATION_EXISTS`.
  3. **R03 (Idempotency Binding)**: Bound `registrationOperations` records for resubmission to `(callerUid, operationId, operationType: "registration-resubmission", targetId: callerUid, payloadHash)`. Replaying exact operations returns idempotent success; replays with modified documents, reasons, or targets fail with 409 `IDEMPOTENCY_CONFLICT`.
  4. **R04 (Auth Session Restoration)**: Fixed registration recovery in `app/auth/register/page.tsx` by subscribing via `onAuthStateChanged` rather than evaluating `auth.currentUser` synchronously on mount, eliminating silent recovery failure during async IndexedDB session restoration on browser refresh.
  5. **R05 (Accurate Recovery UI)**: Replaced false claims of verification email dispatch on recovered registrations with dedicated recovery UI ("Registration Pending Review"), displaying the resident's accurate email populated from Auth/Firestore.
  6. **R06 (Status Classification)**: Removed fabricated, unobservable `in-flight` state from `lib/security/registration-status.ts`, ensuring all advertised states correspond to genuine authoritative persistence.
  7. **R07 (Lifecycle State Machine)**: Strictly gated resubmission to accounts in `status === "Pending"` with `isVerified !== true`. Explicitly rejected `Active`, `Expired`, `Locked`, and `Deleted` accounts with specific error codes.
  8. **R08 (Rules Lockdown)**: Added explicit server-only default-deny security rule for `match /residentVerificationLocks/{residentId} { allow read, write: if false; }` in `firestore.rules`.
  9. Added comprehensive deterministic concurrency, idempotency, lifecycle, and proof security test suite in `test/emulator/registration-resubmission-concurrency.test.ts`.

| Milestone | Status | Verified Evidence |
|---|---|---|
| M-R01: Protected Proof Validation | VERIFIED | `parseCloudinaryAsset`, `mediaRegistry` ownership, and document requirements enforced; arbitrary URLs, foreign assets, and unauthenticated delivery rejected in emulator tests. |
| M-R02: Resubmission Mutual Exclusion | VERIFIED | Firestore transaction contention on `residentVerificationLocks` and `users`; verified with controlled `Promise.all` concurrency race (exactly one 200 winner, competitor 409). |
| M-R03: Exact Canonical Idempotency | VERIFIED | `canonicalResubmissionPayloadHash`, `operationType` binding, exact replay returns 200 idempotent; changed payload returns 409 conflict. |
| M-R04 & M-R05: Auth Recovery & Truthful UI | VERIFIED | `onAuthStateChanged` session restoration, email populated on recovery, truthful pending-review state rendered without false email dispatch claims. |
| M-R06 & M-R07: State Machine & Rules Lockdown | VERIFIED | Dead `in-flight` status eliminated; `residentVerificationLocks` default-denied in `firestore.rules`; lifecycle rejection matrix verified in emulator tests. |
| M-R08: Complete Verification Suite | VERIFIED | Unit (159/159), Emulator/Rules (51/51), E2E Authenticated Chromium (24/24), TypeScript app/test (0 errors), ESLint (0 errors), Build (51/51 routes), Timezone matrix (3 x 159 tests). |

## Registration Recovery, Auth Safety & Security Hardening — historical pass

### Initial-registration atomicity hardening — historical pass (42d41e9)

- **Status**: IMPLEMENTED, LOCALLY VERIFIED, AND SYNCHRONIZED on `main` at `42d41e9ac543e2e24aa0586a61bc6528d57e768e`.
- **Delivered scope**: replaced client-authored initial registration writes with one authenticated, server-authoritative, payload-bound and idempotent Firestore finalization transaction (`/api/resident/registration/finalize`); proof reservations, pending profile, verification, notification, and operation committed atomically.
- **Checks executed**: `npm test` PASS 159/159; `npm run test:rules` PASS 38/38; `npm run test:e2e:auth` PASS 24/24; both TypeScript checks PASS; lint PASS (0 errors, 748 warnings); build PASS (49/49 routes); timezone matrix PASS (29/29 per zone). Fully pushed to `origin/main`.

## Reopened repair pass — confirmed failures after `cbd01f759b3ca12030e8250c81c4dcc520d17e70`

- **Status**: IMPLEMENTED, LOCALLY VERIFIED, AND SYNCHRONIZED on `main` as commit `c631b37f29c0a8c7f097c667c440ee268909b9fa`. Earlier summaries below remain historical evidence for their stated revisions.
- **Requested scope**: repair the three reproduced blockers, complete A07/A11/A12/A14/A16/A18, add production-path regressions, correct evidence, commit and push `main`.
- **Explicit exclusions**: no deployment, rules publication, historical migration, production account/data/asset mutation, branch creation, force push, or general cleanup.
- **Security invariant**: attacker-controlled tokens, identifiers, states, retries, and timestamps cannot create or overwrite authoritative ownership, identity, payment, audit, or protected-media state.
- **Rollback boundary**: source/test/document changes are reversible by the final repair commit; no live-state rollback is required because production mutations are prohibited.

| Milestone | Current status | Required behavioral evidence |
|---|---|---|
| M1: media claim, approval eligibility, provisioning fencing | VERIFIED LOCALLY | Actual route handlers plus Firestore/Auth emulator adapters; forged/expired/conflicting/concurrent/failure cases |
| M2: A07/A11/A12/A14/A16/A18 | VERIFIED LOCALLY | Rules and server transition graph; canonical audit consumers; uncapped pagination/report queries; protected preview/export; three-timezone tests; visible retryable UI failure paths |
| M3: full verification and evidence correction | VERIFIED AND SYNCHRONIZED AT `c631b37` | Unit, emulator, authenticated Playwright, both type checks, lint, build, timezone matrix, and corrected recovery evidence |

### Evidence state at reopen

- Repository baseline: clean `main` at `cbd01f759b3ca12030e8250c81c4dcc520d17e70`, matching `origin/main` when inspected 2026-10-14.
- Confirmed by code inspection: `app/api/media/claim/route.ts` creates absent registry ownership from any string token; approval claim lacks an explicit rejected/unsupported-state guard; admin provisioning permits same-attempt overlap and checks compensation ownership outside a protected transaction stage.
- Environment changes: none. `.env.local` values remain unread and unreported.
- Historical delivery result: the verified repair based on `cbd01f759b3ca12030e8250c81c4dcc520d17e70` was committed and synchronized as `c631b37f29c0a8c7f097c667c440ee268909b9fa`. The current initial-registration pass is tracked separately above.

### M1 checkpoint

- Files changed: `app/api/media/claim/route.ts`, `app/api/cloudinary/sign/route.ts`, `app/api/media/view/route.ts`, `app/api/admin/verifications/approve/route.ts`, `app/api/admin/operations/route.ts`, `lib/security/upload-ticket.ts`, `lib/security/media-auth.ts`, `lib/resident/cloudinary.ts`, `lib/resident/local-storage-store.ts`, `lib/resident/media-claim-client.ts`, and four focused regression files.
- Actual checks: app/test type checks PASS; affected existing unit suites PASS 18/18; registration claim caller PASS 2/2; media claim endpoint + Firestore adapter PASS 3/3; verification production claim adapter PASS 3/3; admin provisioning endpoint/Auth+Firestore fencing PASS 2/2.
- Covered failures: forged capability/ticket, unknown reservation, wrong cloud, expired capability, conflicting owner, concurrent claimers, rejected/unsupported/foreign-processing verification state, same/different provisioning attempts, paused compensation, and injected finalization failure.
- Environment: local Firebase Auth/Firestore emulators only (Java 25); Cloudinary verification used a controlled provider adapter. No live provider/account/asset mutation and no deployment or rules publication.
- Warnings: Node emits `MODULE_TYPELESS_PACKAGE_JSON`; Firebase Admin emits local metadata lookup warnings under the network-restricted emulator environment. Neither changed test outcomes.
- M1 integration evidence: `test/e2e/authenticated-workflows.spec.ts` verifies claimed registration proof ownership through `/api/media/view`; the full authenticated workflow suite passes 24/24.
- M2 evidence: `test/emulator/firestore-rules.test.ts`, `test/firestore-pagination.test.ts`, `test/data-load-error.test.ts`, and the protected-signature E2E workflows cover the repaired boundaries. Query denial/recovery is emulator-backed; no live network outage was induced.

### Final local verification checkpoint — 15 October 2026

- `npm test`: PASS, 155/155 tests across 31 suites.
- `npm run test:rules`: PASS, 28/28 declared Auth/Firestore emulator tests; exit 0.
- `npm run test:e2e:auth`: PASS, 24/24 Chromium workflows (confirmed by Playwright listing and zero-exit full run).
- `npm run typecheck`; `npm run typecheck:test`: PASS, zero errors.
- `npm run lint`: PASS with 0 errors and 741 warnings (2 potentially auto-fixable); warnings remain separate from errors.
- `npm run build`: PASS; Next.js 16.4.0 compiled and generated 48/48 pages.
- Timezone matrix: PASS, 29/29 tests under each of `UTC`, `Asia/Manila`, and `America/Los_Angeles`.
- Environment/configuration changes: none. Verification used local Auth/Firestore emulators and controlled Cloudinary behavior only; no deployment, rule publication, migration, live account/data mutation, or live asset mutation occurred.

- **Date**: 14 October 2026
- **Audited Baseline**: `9ea2f4a360543022461a2968eb1cd7eb2eb09410`
- **Target Branch**: `main`
- **Methodology**: DevKit V9 Preflight & Recovery Contract (`build-plan-architect`, `suggestion-approval-gate`, `intent-skill-router`)

---

## 1. Scope Ledger & Gates

### User-Requested Implementation Scope (COMPLETED & VERIFIED)
- **Group 1: Registration and resident lifecycle (A04, A05, A10)**
  - Fixed registration upload-folder permissions (`talasys/proofs`) and client/rules contract.
  - Created residents in pending lifecycle state (`status: "Pending"`, `accountExpiry: ""`); demographic categories preserved in `statuses`.
  - Issued expiry server-side during authoritative approval (+365 days).
  - Made verification submission and required notifications atomic and retry-safe in Firestore transaction/batches.
  - Allowed admin notification types `['info', 'alert', 'registration', 'reactivation']` in rules while strictly blocking client-authored trusted notifications.
- **Group 2: Verification ownership and protected media (A01, A02, A03)**
  - Enforced single canonical verification owner (`residentId === userId === auth.uid`). Rejected conflicting fields in rules and approval coordinator.
  - Established media ownership through validated owner namespaces (`talasys/<folder>/<ownerUid>/<uuid>`) or server-controlled `mediaRegistry` (denied client-writable reference spoofing).
  - Created secure claim route `POST /api/media/claim` with token verification for pre-registration assets.
  - Classified sensitive proof uploads (`talasys/residents`, `talasys/proofs`, etc.) consistently to authenticated delivery.
- **Group 3: Administrator provisioning and financial integrity (A06, A07, A17)**
  - Attempt-fenced administrator creation (`adminAccountOperations`); blocked concurrent takeover; compensation checks attempt ownership before deleting Auth accounts.
  - Bound idempotency records to `(actorUid, operation, targetId, payloadHash)`, returning 409 on replay mismatch.
  - Defined and enforced canonical request/payment transitions in server operations and rules (`Pending`, `Approved`, `On Process`, `Awaiting Payment`, `Ready for Pick Up`, `Completed`, `Rejected`, `Cancelled`). Preserved `paid`/`waived` invariants; rejected payment confirmation on cancelled/rejected/completed requests; standardized `Processing` to `On Process`.
- **Group 4: Identity recovery completion and external-write safety (A08, A09)**
  - Reconciled email operations with unapplied `profileUpdates` transition to `reconciled` and keep unapplied work resumable instead of falsely marking `completed`.
  - Removed caller-selected elapsed time (`staleTimeoutMs`, `isStale`, arbitrary strings) as proof that an external Auth write stopped. Required verified stopped status or substantive operator attestation (length >= 15).
  - Preserved reconciliation and ownership-fenced exception cleanup without assuming finally survives crash.
- **Group 5: Audit, reports, resident states, media rendering, and UI contracts (A11–A16, A18)**
  - A11: Normalized audit records into canonical view model with structured taxonomy, human-readable details, and fixed chart keys.
  - A12: Authoritative document generator counting using `hasGenerated === true` instead of approval status; complete date range filtering.
  - A13: Correctly excluded and classified `Locked`, `Deleted`, and `Deleted by Resident` residents in active counts, stats, and selectors.
  - A14: Resolved official signatures via `/api/media/view` with token delivery; authorized Document Processing admins for generation; denied unauthorized roles.
  - A15: Canonically read and rendered `rejectionReason` in resident tracker modal.
  - A16: Implemented explicit Asia/Manila date boundaries (`getManilaDayBounds`, `isTimestampToday`, `isTimestampThisWeek`) independent of host timezone.
  - A18: Replaced timer-based readiness with source readiness (`sourcesLoaded.size >= expected`); added refresh triggers and distinguished errors from empty lists.

---

## 2. Invariants & Working Rules
1. Work directly on `main`; never force-push; create no branches.
2. Credentials in `.env.local` strictly confidential and never committed.
3. Security rules and concurrency locks preserved and never bypassed.
4. Mutation tests verified against Firebase emulators and controlled adapters.
5. All verification gates passed: `npm test`, `npm run test:rules`, `npm run test:e2e:auth`, `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run build`.

---

## 3. Phased Execution Status

| Phase | Description | Status | Verification Evidence |
|---|---|---|---|
| Phase 1 | Group 1: Registration and resident lifecycle (A04, A05, A10) | COMPLETED | `test/milestone-b.test.ts`, `test/verification-approval.test.ts`, emulator rules |
| Phase 2 | Group 2: Verification ownership and protected media (A01, A02, A03) | COMPLETED | `test/protected-media.test.ts`, `POST /api/media/claim`, `test/e2e/authenticated-workflows.spec.ts` |
| Phase 3 | Group 3: Administrator provisioning and financial integrity (A06, A07, A17) | COMPLETED | `test/superadmin-provisioning.test.ts`, `app/api/admin/operations/route.ts`, emulator rules |
| Phase 4 | Group 4: Identity recovery completion and external-write safety (A08, A09) | COMPLETED | `test/identity-coordination-acceptance.test.ts`, `test/emulator/identity-coordination-emulator.test.ts` |
| Phase 5 | Group 5: Audit, reports, resident states, media rendering, UI contracts (A11–A18) | COMPLETED | `test/audit-view-and-timezones.test.ts`, `test/milestone-d.test.ts`, `test/milestone-g.test.ts` |
| Phase 6 | Full Verification, Evidence Ledger, Handoff & Push | COMPLETED | Full suite passing: Unit (149/149), Rules (16/16), E2E Auth (22/22), Typecheck (0 err), Build (0 err) |

---

## 4. Verification Summary
- `npm test`: 149/149 passed (31 suites)
- `npm run test:rules`: 16/16 passed (Auth & Firestore emulators)
- `npm run test:e2e:auth`: 22/22 passed (Playwright chromium headless against emulators)
- `npm run typecheck`: 0 errors
- `npm run typecheck:test`: 0 errors
- `npm run lint`: 0 errors (706 warnings)
- `npm run build`: 48/48 pages compiled successfully (Turbopack production build)
