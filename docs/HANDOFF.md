# TALASYS Remediation Handoff

## Current handoff — 2026-10-15 (Final Registration Lifecycle Remediation: R09–R12)

Working branch: `main`. Audited baseline: `26f067bc1939dd3c2b2a86bdcea9efe2329ed8ba`.

This final remediation and automatic regression repair pass resolves the confirmed defects R09–R12 while preserving all prior repairs:
1. **R09 (Pending registration verification deletion bypass)**: In `firestore.rules`, client deletion of verifications with `type == "registration"` is strictly denied. Residents may only delete unreviewed pending verifications of type `profile-edit` or `reactivation`. SuperAdmin retains deletion capabilities. This prevents residents from breaking server lifecycle invariants (`residentVerificationLocks` and `users.hasPendingVerification`).
2. **R10 (Cloudinary provider verification fail-closed)**: `app/api/resident/registration/resubmit/route.ts` and `lib/security/registration-resubmission.ts` enforce fail-closed behavior. Route no longer silently swallows verifier initialization errors; throws 503 `PROVIDER_VERIFICATION_UNAVAILABLE`. `processRegistrationResubmission` mandates `dependencies.verifyAsset`, rejecting with 503 `PROVIDER_VERIFICATION_REQUIRED` if absent. Asset 404 maps to `PROOF_ASSET_NOT_FOUND` and metadata mismatch maps to `PROOF_IDENTITY_MISMATCH` (409). Provider verification precedes database transactions, guaranteeing zero partial writes on failure.
3. **R11 (Idempotent retry verification ID correction)**: In `lib/security/registration-resubmission.ts`, transactional same-operation detection returns `{ idempotent: true, verificationId: opData.verificationId }`. The outer return accurately surfaces this authoritative `verificationId` on all concurrent replays and transaction retries, preventing callers from receiving nonexistent uncommitted IDs.
4. **R12 (Frontend resubmission operation ID preservation)**: Created `lib/resident/resubmission-operation.ts` to manage deterministic payload fingerprinting and stable `operationId` persistence in `sessionStorage` (`talasys_resubmit_op_${residentId}`). Updated `hooks/resident/use-resident-data.ts` and `app/resident/profile/page.tsx` with duplicate submit guards (`isSubmittingProfileEditRef`), stable `operationId` forwarding in request body, cleanup on completion or 409 `PENDING_VERIFICATION_EXISTS`, and truthful UI state reporting. Sensitive tokens/secrets are never stored.

Evidence is provided by:
- 163 unit tests (PASS, up from 159 across 31 suites)
- 56 Auth/Firestore emulator tests (PASS, up from 51)
- 24 authenticated Playwright Chromium E2E tests (PASS)
- Both TypeScript checks (`typecheck` & `typecheck:test`: 0 errors)
- ESLint (0 errors, 791 warnings)
- Production build (51/51 routes successfully generated with Next.js 16.4.0 Turbopack)
- Timezone matrix (3 x 6 tests under UTC, Asia/Manila, America/Los_Angeles)
- Clean `git diff --check`

No production deployment, Firebase Rules publication, live account/data mutation, or live Cloudinary asset mutation was performed.

Deployment order is mandatory: deploy and verify the application/server code first, then publish the tightened Firestore Rules.

## Prior handoff — 2026-10-15 (Comprehensive Registration & Identity Lifecycle Hardening: R01–R08)

Working branch: `main`. Audited baseline: `242835a6d1aba8a31f582776f72a793ee8af23ac`. Commit: `26f067bc1939dd3c2b2a86bdcea9efe2329ed8ba`.

The prior handoff below is retained as historical context and must not be used for current test counts.

## Current state — 2026-10-14

Working branch: `main`. Baseline reviewed: `9ea2f4a360543022461a2968eb1cd7eb2eb09410`.

All 18 audit findings (A01 through A18) across the 5 repair groups have been fully implemented and verified against unit suites, Firestore rules, and authenticated browser E2E workflows.

**Scope change & working boundaries:**
No production account modifications, live provider mutations, deployments, rules publication, historical migrations, or data deletion were performed. Credentials in `.env.local` were kept strictly confidential and never exposed.

---

## Implemented in this repair pass (A01–A18)

### Group 1: Registration and resident lifecycle (A04, A05, A10)
- **A04 (Registration uploads & rules)**: Fixed client upload folder to default to `"talasys/proofs"` across registration, profile-edit, and reactivation flows. Updated `firestore.rules` to enforce `status in ['Pending', 'pending']` and `accountExpiry == ''` on user registration.
- **A05 (Pending lifecycle & server expiry)**: Residents are created in `"Pending"` lifecycle state without pre-issuing active accounts. Demographic categories are kept separate in `statuses`. Authoritative approval server route (`/api/admin/verifications/approve`) calculates and sets server-side `accountExpiry = now + 365 days`.
- **A10 (Atomic verification & admin notification types)**: Verification submission and admin notification creation run atomically. Allowed admin notification types `['info', 'alert', 'registration', 'reactivation']` in security rules while strictly blocking arbitrary client-authored trusted notifications.

### Group 2: Verification ownership and protected media (A01, A02, A03)
- **A01 (Canonical verification owner)**: Enforced `residentId === userId === auth.uid` in security rules and the server approval coordinator. Conflicting owner fields are rejected.
- **A02 (Validated media ownership & registry)**: Resolved asset ownership through validated owner namespaces (`talasys/<folder>/<ownerUid>/<uuid>`) or server-controlled `mediaRegistry`. Client-writable references can no longer spoof asset ownership. Created `POST /api/media/claim` with token verification for pre-registration proof claiming.
- **A03 (Consistent authenticated delivery)**: Included `"talasys/residents"` in sensitive folders. Protected upload parameters and signed viewing routes are aligned across registration, profile-edit, and reactivation.

### Group 3: Administrator provisioning and financial integrity (A06, A07, A17)
- **A06 (Fenced admin creation & safe compensation)**: Admin creation operations are fenced by operation and attempt ID (`adminAccountOperations`). Concurrent takeover is blocked. Compensation verifies current operation attempt ownership before deleting Auth accounts.
- **A07 (Canonical financial & request transitions)**: Server operations enforce canonical request statuses (`Pending`, `Approved`, `On Process`, `Awaiting Payment`, `Ready for Pick Up`, `Completed`, `Rejected`, `Cancelled`). Transitions preserve `paid`/`waived` invariants; payment confirmation on cancelled/rejected requests is rejected; `Processing` is standardized to `On Process`.
- **A17 (Payload-bound idempotency)**: Bound idempotency records to `(actorUid, operation, targetId, canonicalPayloadHash)`. Replay attempts with mismatched payloads return HTTP 409 Conflict.

### Group 4: Identity recovery completion and external-write safety (A08, A09)
- **A08 (Incomplete recovery tracking)**: Email alignment recovery checks for unapplied `profileUpdates`. Incomplete operations transition to `reconciled` with unapplied work resumable instead of falsely declaring `completed`.
- **A09 (Strict external write safety)**: Removed caller-selected elapsed time (`staleTimeoutMs`, `isStale`, arbitrary short strings) as proof that an external Auth write stopped. Requires verified stopped status or substantive operator attestation.

### Group 5: Audit, reports, resident states, media rendering, and UI contracts (A11–A16, A18)
- **A11 (Canonical audit view model)**: Normalized server and legacy audit records via `normalizeAuditLog` with structured taxonomy, human-readable details, fixed chart data keys (`dataKey="action"`, `dataKey="count"`), and consistent actor attribution.
- **A12 (Authoritative generated document counting)**: Document generator counts strictly filter `hasGenerated === true` instead of approval status; date range reports query complete periods.
- **A13 (Inactive resident exclusion)**: Excluded and classified `Locked`, `Deleted`, and `Deleted by Resident` residents from active counts, generator searches, and demographic reports.
- **A14 (Signature media authorization & operational roles)**: Resolved official signatures through `/api/media/view` with token delivery; authorized Document Processing admins for generation; denied unauthorized roles (View Only, Verification Only, Resident Management, Residents).
- **A15 (Canonical rejection reason)**: Displayed `request.rejectionReason` directly in resident request tracker modal and verification reviews.
- **A16 (Explicit Asia/Manila date boundaries)**: Implemented `getManilaDayBounds`, `isTimestampToday`, and `isTimestampThisWeek` (fixed UTC+8 offset) evaluating identically regardless of server/browser timezone.
- **A18 (Source readiness)**: Replaced timer-based readiness with source readiness (`sourcesLoaded.size >= expected`); added refresh triggers and distinguished errors from empty lists.

---

## Reproducible local evidence

- `npm test` — PASS, 149/149 tests across 31 suites.
- `npm run test:rules` — PASS, 16/16 tests against Auth & Firestore emulators.
- `npm run test:e2e:auth` — PASS, 22/22 Playwright tests in Chromium against emulators.
- `npm run typecheck` — PASS (0 errors).
- `npm run typecheck:test` — PASS (0 errors).
- `npm run lint` — PASS (0 errors).
- `npm run build` — PASS; Next.js 16.4.0 Turbopack compiled 48 routes.

---

## Remaining boundaries & limitations

1. Standard Cloudinary HMAC URL signatures do not enforce expiration on query parameters (`exp`). True time-bounded expiration requires Cloudinary token authentication (`__cld_token__` with `token_key`), which is not configured in this Cloudinary tier. The application truthfully reports `expiresAt: null`.
2. Historical migration scripts remain available for reference but were not executed per the planned fresh data reset.
3. **Production Deployment & Rules Publication**:
   - No production deployment or live Firestore Rules publication was executed. Requires operator maintenance window and confirmed production secrets.
