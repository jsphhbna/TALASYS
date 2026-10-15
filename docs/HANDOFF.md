# TALASYS Remediation Handoff

## Current handoff — 2026-10-15

Working branch: `main`. Audited baseline: `c631b37f29c0a8c7f097c667c440ee268909b9fa`. The delivered revision is the final synchronized `main` HEAD reported with the Git handoff; this document intentionally avoids a self-referential commit SHA.

The current repair replaces the browser-authored initial registration batch and later media claim with `POST /api/resident/registration/finalize`. The endpoint derives UID/email and lifecycle fields authoritatively, validates the allowlisted registration/proof payload, verifies the provider outside transaction retries, and atomically claims every proof while creating one resident, verification, admin notification, and immutable payload-bound operation record. Exact-operation replay is successful, changed replay is 409, and an unknown/lost response retries without deleting Auth. Verification email is attempted once after confirmed completion; mail failure preserves the finalized account and directs the user to the existing login resend path.

Firestore Rules now require an authoritative user profile for active-account privileges, deny client creation of initial profiles and all client access to `registrationOperations`, and distinguish server-only initial registration from the supported existing-unverified-resident resubmission. Profile edit, reactivation, payment, and owner update behavior remains passing.

Evidence is provided by 159 unit/integration tests, 38 declared Auth/Firestore emulator tests (standard command exit 0), 24 authenticated Chromium workflows, both TypeScript checks, lint (0 errors; 748 warnings), a 49-route production build, and 29 timezone tests in each of UTC, Asia/Manila, and America/Los_Angeles. Named production-path regressions are recorded in `docs/EVIDENCE_LEDGER.md`, including the mandatory committed-transaction/lost-response replay.

No deployment, Firebase Rules publication, historical migration, live account/data change, or live Cloudinary asset mutation was performed. `.env.local` values were neither printed nor staged. Controlled adapters and local emulators are not evidence of live-provider availability. A18 permission failure and recovery are adapter-backed; no live network outage was induced.

Deployment order is mandatory: deploy and verify the application/server finalizer first, then publish the tightened Firestore Rules. Publishing Rules first would block the legacy client registration path before the server endpoint is available.

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
