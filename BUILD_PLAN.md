# TALASYS Audit Findings Remediation Build Plan (A01–A18)

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
