# TALASYS Comprehensive Remediation Plan (61 Findings)

> **Independent-review correction (2026-10-13): REOPENED.** The former
> "completed and verified" summary below is historical and must not be used as
> current release evidence. Source inspection found unfinished migrations,
> client-authored audit events, non-atomic identity approval, insecure media
> fallbacks/substring ownership, hard-coded request types, and simulation-only
> tests. The active repair checklist is authoritative until every item has
> executed evidence.

## Active repair checklist

Status vocabulary: `IN PROGRESS`, `IMPLEMENTED - NOT VERIFIED`, `VERIFIED`,
`DEPLOYMENT PENDING`, and `BLOCKED`.

- [x] M1 inventory: canonical collections and persisted fields inspected;
  inaccurate handoff and issue status reopened. Historical media protection is
  `IN PROGRESS`; production migration remains separately `DEPLOYMENT PENDING`.
- [x] M2 audit timestamp migration: canonical collection, shared Admin/env
  initialization, safe chunking, restartability, rollback, and CLI tests.
- [x] M3 Cloudinary migration: real provider/Firestore execution, complete
  sensitive-field discovery, manifest/checkpoint/resume, recovery, and tests.
- [x] M4 super-admin provisioning: create/modify separation, explicit promotion
  and reset controls, profile preservation, reconciliation, operator audit, and
  secret-safe password input.
- [x] M5 approval coordination: authoritative server workflow, concurrency
  claim, idempotency, cross-service recovery, notification/audit consistency.
- [ ] M6 authoritative mutation audit (`IN PROGRESS`): server-derived facts, durable coupling,
  telemetry separation, proxy trust validation, and negative authorization test.
- [ ] M7 protected media (`IN PROGRESS` / provider expiry `BLOCKED`): deny fallback, exact identity matching, full schema,
  authoritative attachment, all consumers, provider-enforced expiry verification.
- [x] M8 configured documents: authoritative enabled types/fees, custom types,
  account expiry, idempotent request/notification creation.
- [x] M9 Verification Only UX: verification-only navigation/content/routes and
  backend permission checks across desktop, mobile, and live role changes.
- [ ] M10 implementation evidence (`PARTIALLY VERIFIED`): rules emulator,
  controlled actual-handler tests, failure/concurrency and migration tests,
  app/test type checks, expanded lint, production build, and public/redirect
  browser smoke tests pass. Authenticated role workflows and live provider
  checks remain open. Production audit has no high/critical advisories (two
  moderate); the full audit still reports development-tool advisories.

## 2026-10-13 verification checkpoint

- `npm test`: PASS, 110/110. The copied `reopened-remediation.test.ts` suite was
  removed; it is not evidence.
- `npm run test:rules`: PASS, 5/5 against the Firestore Emulator.
- `npm run typecheck` and `npm run typecheck:test`: PASS.
- `npm run lint -- --quiet`: PASS with scripts/tests included. Legacy warnings
  remain visible without `--quiet` and are not represented as zero warnings.
- `npm run build`: PASS, 45 application routes.
- Playwright: PASS, 4/4 desktop/mobile unauthenticated redirect and reflow
  smoke checks against a real local Next server. Authenticated role E2E is open.
- `npm audit --omit=dev`: no high or critical advisories; two moderate `uuid`
  advisories through ExcelJS remain. Full audit: 11 high and 5 moderate in
  development tooling, primarily Firebase CLI and ESLint transitive trees.
- No production deployment, security-rule publication, account provisioning,
  or data/media migration was executed.

## 1. Project & Architecture Context
- **Repository**: [TALASYS](https://github.com/jsphhbna/TALASYS)
- **Base Commit**: `afae47d31c2072b300177679884238f10cf65e32`
- **Tech Stack**: Next.js 16 (App Router), React 19, Firebase Auth & Firestore, Cloudinary Media, Tailwind CSS.
- **Scope**: Complete remediation of 61 identified findings across Super Admin, Admin, and Resident portals.
- **Working branch**: `main` (updated by the 2026-10-14 branch workflow override)

---

## 2. Milestone Architecture

### Milestone A — Baseline & Reproduction Harness [COMPLETED & VERIFIED]
- Register all 61 issues in `docs/TALASYS-ISSUE-REGISTER.md`.
- Establish living remediation plan in `docs/TALASYS-REMEDIATION-PLAN.md` and DevKit state files.
- Establish isolated test harness (`node --test --experimental-strip-types`) and baseline checks.
- Document deployment, configuration, and security prerequisites.

### Milestone B — Auth, Roles, Permissions & Mutation Integrity [COMPLETED & VERIFIED]
- **Target Issues**: #26, #27, #28, #29, #30, #54, #55, #56, #57, #58, #59, #61
- Canonicalize RBAC role matrix across UI, hooks, and `firestore.rules`.
- Enforce strict `firestore.rules` (allowlists, immutable fields, status machine, role escalation prevention).
- Remove client-side hardcoded bootstrap credentials and local-only spoofing (#54).
- Enforce backend session revocation for locked/deleted admin accounts (#30).
- Wrap multi-document operations in atomic Firestore `writeBatch` or transactions (#61).
- Protect notification creation and verification submission integrity (#57, #58).

### Milestone C — Upload, Media, API & Dependency Security [COMPLETED & VERIFIED]
- **Target Issues**: #50, #51, #52, #53, #60
- Stored XSS defense in document generation template rendering (#50).
- Server-authenticated & quota-constrained Cloudinary signing endpoint with registration ticket flow (#51).
- Protect sensitive media delivery (ID evidence, signatures) (#52).
- Secure backup endpoint: require `Authorization: Bearer` header, revoke token checks, set `Cache-Control: no-store` (#53).
- Triage and upgrade vulnerable dependencies (`next`, `xlsx`, `sharp`, `protobufjs`) (#60).

### Milestone D — Shared Reporting, Audit & Lifecycle Correctness [COMPLETED & VERIFIED]
- **Target Issues**: #1, #3, #6, #11, #14, #15, #16, #17, #18, #19, #31
- Super Admin Alerts & Signals semantics and monitored conditions (#1).
- Correct timestamp parsing for resident statistics (remove 1700s bug) (#3).
- Trusted server IP extraction for audit logs (#6).
- Truthful presence and category growth metrics (#11).
- Cursor-based pagination and un-truncated historical aggregates (#14).
- Normalize audit timestamp types (number vs string) and schema (#15, #16).
- Derive resident lifecycle status (`Expiring`, `Expired`, `Verified`) correctly (#17).
- Include all verification types in history (#18).
- Metric date boundary corrections for Today / This Week / Reports Generated (#19).
- Record audit logs for critical Super Admin mutations (#31).

### Milestone E — Reports, Filters, Exports & List Pagination [COMPLETED & VERIFIED]
- **Target Issues**: #2, #4, #5, #7, #8, #9, #10, #12, #13, #20, #21
- Date range filtering and report generation in Super Admin Reports (#2).
- Reason Analytics Category filter integration (#4).
- Super Admin audit real pagination & full export (#5).
- Admin resident list real pagination (#7).
- Custom report generator: type, period, and output format (PDF/CSV) (#8).
- Wire inactive report cards (#9).
- Include all selected columns in Category reports export (#10).
- Guard zero counts in Reason Analytics (#12).
- Align Reason Analytics purpose labels and document types (#13).
- Resident history date filtering for table & pagination reset (#20, #21).

### Milestone F — Resident Request, Profile & Payment Workflows [COMPLETED & VERIFIED]
- **Target Issues**: #22, #23, #24, #25, #38, #42, #43, #44, #45, #47, #48, #49
- Resident rejection details & authorization letter viewer/download (#22).
- Authorization letter file upload and durable reference persistence (#23).
- Align dashboard clearance quick action shortcut (#24).
- Await request submission properly with error handling (#25).
- Payment modal state reset across request targets (#38).
- Apply approved profile picture to user profile (#42).
- Preserve resident voter/sub-categories during profile edits (#43).
- Coordinated email change flow (#44).
- Explicit Cancelled state in request tracker (#45).
- Enforce required verification documents before submission (#47).
- Type-aware registration resubmission path (#48).
- Resident reactivation request workflow (#49).

### Milestone G — UI Accessibility, Reflow & Truthful Error States [COMPLETED & VERIFIED]
- **Target Issues**: #32, #33, #34, #35, #36, #37, #39, #40, #41, #46
- Adjust Permissions-Policy to allow camera for same-origin (#32).
- Proper camera stream track cleanup and countdown abort on unmount (#33).
- Convert custom modals to accessible Radix Dialog with focus trap and ARIA (#34).
- Responsive mobile drawer navigation and layouts (390px, 768px, desktop) (#35).
- Fix nested `<button>` inside `<Button>` in verification queue (#36).
- Fix overdue verification badge date calculation (#37).
- Review modal race condition prevention (#39).
- Mount Sonner `<Toaster />` alongside existing Radix toaster (#40).
- Handle async mutation promises and spinners cleanly (#41).
- Distinct fetch error states vs empty data states (#46).

### Milestone H — Integrated Regression & Deployment Readiness [COMPLETED & VERIFIED]
- End-to-end regression validation across all roles: 66/66 automated tests pass across 31 suites.
- TypeScript compiler verification code 0 (`npx tsc --noEmit`).

### Milestone I — Independent Review Repair Pass [COMPLETED & VERIFIED]
- **Target Items**:
  1. Verification Only Workspace & Route Guards: Dedicated `VerificationWorkspace` component rendered on `/admin/dashboard` showing solely verification queues, review actions, and history; completely stripped unrelated cards/tabs/navigation; route guards in `AdminLayout` redirecting forbidden direct URLs; dynamic session role change propagation.
  2. Reopened #28/#30: `app/api/admin/update-resident-email/route.ts` fails closed on unconfigured Admin SDK (503), checkRevoked token verification, authoritative `users` lookup, rejects Locked/Deleted, explicit permission check (SuperAdmin, FullAdmin, ResidentMgmt; Verification Only strictly with matching pending profile-edit verification; blocks View Only & Document Processing), prevents modification of privileged accounts, server audit with extracted IP.
  3. Reopened #51: Upload signing security - removed `idToken.length > 20` mock fallback, removed hardcoded secret fallbacks, single-use ticket nonce tracking (`verifyAndConsumeRegistrationTicket`), role-based folder policy (tickets: proofs only; residents: proofs/receipts/letters, forbidden from signatures).
  4. Reopened #52: Private media delivery - Cloudinary token authentication (`__cld_token__` with `st`, `exp`, `acl`, `hmac` and URL signature), authoritative record-based ownership resolution (`app/api/media/view/route.ts`), removed mock admin auth/secrets, created `SecureMediaViewer` component supporting images and PDFs, migration script `scripts/migrate-cloudinary-access.ts`.
  5. Reopened #56: Authoritative fees & payment state - protected route `POST /api/resident/requests/create` computing fees from `system_config` and statutory rules (Indigency & First-Time Jobseeker = free, demographic indigent waivers), blocked direct resident writes in `firestore.rules` (`allow create: if canManageRequests()`).
  6. Reopened #61/#44: Atomic approval & identity consistency - `approveVerification` and `updateResident` synchronize with Firebase Auth FIRST via `/api/admin/update-resident-email` and propagate failures before modifying Firestore; uses `writeBatch` for atomic updates to verifications, users, and notifications; guards against stale/duplicate processing (`status === "pending"`).
  7. Reopened #6: Actual audit IP capture - `lib/security/request-ip.ts` extracts IP from trusted proxy headers (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`) with IPv4/IPv6 validation; server-authored audit endpoint `POST /api/audit/log` records real actor IP.
  8. Dashboard signals & refresh - `hooks/superadmin/use-superadmin-data.ts`: real-time listener for queue counts, dynamic clearing of locked admin alerts and backlog alerts, real `refresh()` implementation, separates residents from admins.
  9. Reopened #60: Dependency remediation - upgraded Next.js to `^16.4.0` in `package.json` and committed `package-lock.json`, `npm audit fix` applied, documented reachability analysis for remaining items in `docs/DEPENDENCY_TRIAGE.md`.
  10. Verification suite: 94 automated unit/integration tests passing (including 28 in `test/reopened-remediation.test.ts`), `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `npm run build` compiled 44/44 routes for production with Next.js 16.4.0.

---

## 3. Deployment & Migration Readiness Checklist

1. **Environment Variables**:
   - Ensure `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` are configured for the production Firebase project.
   - Set `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
   - Set `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` for server-side Next.js route handlers (`/api/backup`, `/api/admin/update-resident-email`, `/api/audit/log`, `/api/resident/requests/create`).
   - Set `REGISTRATION_TICKET_SECRET` for secure registration proof upload ticket signing.

2. **Security Rules Deployment**:
   - Deploy `firestore.rules` using Firebase CLI (`firebase deploy --only firestore:rules`).
   - The hardened rules enforce strict role immutability, resident registration constraints, owner update allowlists, request creation server enforcement, and locked admin account blocks.

3. **Database Migration Script**:
   - For legacy Firestore `activityLogs` and `systemAlerts`, run `npx ts-node scripts/migrate-audit-timestamps.ts`.
   - For legacy Cloudinary public assets, run `scripts/migrate-cloudinary-access.ts` to transition historical assets to authenticated storage.

4. **Production Build & Verification**:
   - Run `npm test` to verify all 94 regression test cases (100% PASS).
   - Run `npm run lint` (ESLint 9 passing with 0 errors).
   - Run `npx tsc --noEmit` (TypeScript 0 errors).
   - Run `npm run build` to verify production Next.js 16.4.0 bundle creation (44/44 routes compiled).
