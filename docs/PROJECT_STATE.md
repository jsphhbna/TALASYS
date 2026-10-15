# TALASYS Project State

## Current verified state — 15 October 2026 (R01–R08 Pass)

- **Working branch**: `main`
- **Audited baseline**: `242835a6d1aba8a31f582776f72a793ee8af23ac`
- **Status**: Comprehensive registration and identity lifecycle audit, security hardening, and final remediation (R01–R08) are fully implemented and verified.
  1. Proof validation in `registration-resubmission.ts` requires authentic Cloudinary assets (`talasys/proofs/${callerUid}/` or `registration/`), authenticated delivery, valid `mediaRegistry` ownership, and matches classification requirements (R01).
  2. Transactional mutual exclusion on `residentVerificationLocks/{residentId}` prevents duplicate concurrent resubmissions (R02).
  3. `registrationOperations` enforces `operationType: "registration-resubmission"`, `targetId`, and canonical payload hash idempotency (R03).
  4. Client registration recovery listens to `onAuthStateChanged` rather than one-shot mount evaluation, restoring accounts smoothly after browser refresh (R04).
  5. Recovery UI renders accurate pending-review status and accurate resident email without falsely claiming a verification email was dispatched (R05).
  6. Dead `in-flight` status removed from `registration-status.ts` (R06).
  7. Strict lifecycle enforcement allows only `status === "Pending"` and `isVerified !== true` to resubmit, rejecting Active, Expired, Locked, and Deleted accounts (R07).
  8. `firestore.rules` enforces default-deny for `residentVerificationLocks/{residentId}` (R08).
- **Rules state**: client creation of initial user profiles, registration verifications, and notifications is denied; `residentVerificationLocks` is server-only (deny all client read/write); existing unverified registration resubmission is routed through `/api/resident/registration/resubmit`.
- **Verification metrics**: unit 159/159; Auth/Firestore emulator exit 0 with 51 declared tests (including 5 new deterministic concurrency/idempotency/lifecycle tests); authenticated Chromium 24/24; both TypeScript checks pass (0 errors); lint 0 errors/784 warnings; Next.js 16.4 production build 51/51 routes; timezone suites pass under UTC, Asia/Manila, and America/Los_Angeles; `git diff --check` passes cleanly.
- **Evidence boundary**: local emulators and controlled provider behavior only. No production deployment, rules publication, historical migration, live account/data change, or live Cloudinary asset mutation was performed.
- **Deployment order**: deploy and verify the application/server finalizer, recovery, and resubmission endpoints first; only then publish the tightened Firestore Rules. Neither action was performed here.

The dated material below is historical and applies only to the revision and counts stated there.

- **Date**: 14 October 2026
- **Current Branch**: `main`
- **Head Commit**: `[Branch Head]`
- **Status**: **All 18 audit findings (A01–A18) repaired and verified locally; production/provider operations pending**

## 14 October audit remediation (A01–A18)

- **Group 1 (A04, A05, A10)**: Registration uploads use `talasys/proofs`; residents created in `"Pending"` lifecycle state; server-side account expiry issued upon authoritative approval; verification and admin notification creation runs atomically; admin notification types `['info', 'alert', 'registration', 'reactivation']` allowed in rules while client-authored notifications are blocked.
- **Group 2 (A01, A02, A03)**: Canonical verification owner (`residentId === userId === auth.uid`) enforced; media ownership validated via owner namespaces and server-controlled `mediaRegistry` (preventing client-writable reference spoofing); secure pre-registration claim route implemented (`POST /api/media/claim`); consistent authenticated delivery classification across all sensitive folders.
- **Group 3 (A06, A07, A17)**: Attempt-fenced admin account creation; blocked concurrent takeover; attempt-verified compensation preventing deletion of completed accounts; canonical request/payment state machine enforced preserving `paid`/`waived` invariants; payload-bound idempotency returning 409 on replay mismatch.
- **Group 4 (A08, A09)**: Reconciled email operations with unapplied `profileUpdates` transition to `reconciled` keeping remaining work resumable; caller-selected elapsed time removed as proof of stopped external writes; conservative recovery attestation enforced.
- **Group 5 (A11–A16, A18)**: Canonical audit log normalization with structured taxonomy, human-readable details, and fixed chart keys; document generator counts strictly track `hasGenerated === true`; inactive residents (`Locked`, `Deleted`, `Deleted by Resident`) excluded from active lists and selectors; official signatures resolved via `/api/media/view` with authorized delivery; Document Processing administrators authorized to generate signed documents; canonical `rejectionReason` rendered directly in resident tracker modal; explicit Asia/Manila date boundaries (`getManilaDayBounds`, `isTimestampToday`, `isTimestampThisWeek`) independent of host timezone; source readiness replacing timer heuristics.

## Verification & Test Infrastructure
- **Automated Test Suite**: `npm test` -> **149 passed, 0 failed across 31 suites**.
- **Emulator Concurrency & Rules Suite**: `npm run test:rules` -> **16 passed, 0 failed against Auth & Firestore emulators**.
- **Authenticated E2E Suite**: `npm run test:e2e:auth` -> **22 passed, 0 failed across Chromium workflows**.
- **TypeScript Static Verification**: `npm run typecheck` & `npm run typecheck:test` -> **Exit Code 0 (0 errors)**.
- **ESLint Verification**: `npm run lint` -> **Exit Code 0 (0 errors)**.
- **Production Build**: `npm run build` -> **Exit Code 0 (All 48 static/dynamic routes successfully generated with Next.js 16.4.0 Turbopack)**.
- **Issue Register**: [docs/TALASYS-ISSUE-REGISTER.md](file:///c:/Users/Administrator/Downloads/TALASYS/docs/TALASYS-ISSUE-REGISTER.md).
- **Dependency Triage**: [docs/DEPENDENCY_TRIAGE.md](file:///c:/Users/Administrator/Downloads/TALASYS/docs/DEPENDENCY_TRIAGE.md).
