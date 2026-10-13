# TALASYS Comprehensive Remediation Plan (61 Findings)

## 1. Project & Architecture Context
- **Repository**: [TALASYS](https://github.com/jsphhbna/TALASYS)
- **Base Commit**: `afae47d31c2072b300177679884238f10cf65e32`
- **Tech Stack**: Next.js 16 (App Router), React 19, Firebase Auth & Firestore, Cloudinary Media, Tailwind CSS.
- **Scope**: Complete remediation of 61 identified findings across Super Admin, Admin, and Resident portals.
- **Branch**: `remediation/61-findings`

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
- TypeScript compiler verification code 0 (`npx tsc --noEmit --incremental false`).
- All 61 issues marked `fixed and verified` in `docs/TALASYS-ISSUE-REGISTER.md`.

---

## 3. Deployment & Migration Readiness Checklist

1. **Environment Variables**:
   - Ensure `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` are configured for the production Firebase project.
   - Set `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
   - Set `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` for server-side Next.js route handlers (`/api/backup`, `/api/admin/update-resident-email`).

2. **Security Rules Deployment**:
   - Deploy `firestore.rules` using Firebase CLI (`firebase deploy --only firestore:rules`).
   - The hardened rules enforce strict role immutability, resident registration constraints, owner update allowlists, and locked admin account blocks.

3. **Database Migration Script**:
   - For legacy Firestore `activityLogs` and `systemAlerts`, any records created prior to remediation with string timestamps are normalized dynamically by `parseAuditTimestamp()`.
   - To migrate legacy documents in place: run `npx ts-node scripts/migrate-audit-timestamps.ts` (idempotent; converts numeric strings to numbers, dry-run by default, run with `--commit` to apply).

4. **Production Build & Verification**:
   - Run `npm test` to verify all 66 regression test cases.
   - Run `npm run build` to create the production Next.js output bundle.
