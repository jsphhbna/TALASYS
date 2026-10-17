# TALASYS — Hands-On Acceptance Test Plan

**Document Version:** 1.1.0 (MT01–MT03 Pre-Manual Testing Readiness)
**Target Environment:** Local Staging / Deployed Acceptance Environment
**Repository:** `jsphhbna/TALASYS`
**Branch:** `main`
**Baseline Verified Commit:** `e83f35c776e98669f713c9db43269723710d31a1`
**Framework:** DevKit V9 RC10
**Testing Execution Model:** Human manual execution with tabular evidence capture

---

## SECTION A — PROJECT READINESS GATES & ENVIRONMENT PRE-FLIGHT

### 1. Five-Stage Project Readiness Gate

Before human testers execute manual acceptance tests, the project lifecycle must be verified against the following five formal readiness gates:

| Readiness Gate | Definition | Current Status | Verification Criteria |
|---|---|---|---|
| **Stage 1: Source Ready** | The code is committed, working tree is clean, and application builds without errors. | **VERIFIED** | `git status` clean, `npm run build` exits 0, no syntax or compilation defects. |
| **Stage 2: Locally Verified** | Required automated unit, integration, emulator, and E2E regression test suites pass cleanly. | **VERIFIED** | `npm test` (293/293), `npm run test:rules` (24/24), emulator tests (89/89), `npm run test:e2e:auth`, `npm run typecheck` (0 errors), `npm run lint` pass. |
| **Stage 3: Staging Ready** | The tested application, Firestore database/emulator, Cloudinary storage, and test accounts are provisioned in the intended staging environment. | **PENDING STAGING PROVISIONING** | Staging environment spun up; environment variables configured; Firestore rules deployed; Cloudinary upload preset operational. |
| **Stage 4: Manual Testing Started** | Human testers have actively executed test cases across resident, administrative, and superadmin roles. | **NOT STARTED** | Manual testers begin stepping through scenarios in Sections B through F. |
| **Stage 5: Acceptance Passed** | All required manual scenarios have passed or have formally documented, accepted limitations approved by stakeholders. | **PENDING** | All test cases in this plan have recorded `Status: PASS` or approved `Accepted Limitation` in `docs/HANDS_ON_DEFECT_REGISTER.md`. |

> [!IMPORTANT]
> Do not label pending manual tests as passed. Automated test passes do NOT substitute for human execution evidence. Never claim a live deployment matches the repository without verifying the deployed commit SHA.

---

### 2. Human Tester Pre-Flight Verification Checklist

Each tester must verify and confirm the following 10 prerequisites prior to commencing testing:

- [ ] **1. Git Commit SHA Checked Out:** Working directory is on `main` at the verified commit (`e83f35c776e98669f713c9db43269723710d31a1` or subsequent MT release commit).
- [ ] **2. Application Build Matches Commit:** The running dev/staging server was built from this exact commit (`git diff --check` clean).
- [ ] **3. Target Firebase Project Confirmed:** The active Firebase project ID is known and isolated (e.g. `talasys-acceptance-staging` or local emulator).
- [ ] **4. Firestore Security Rules Verified:** `firestore.rules` matches the repository version. *(Do NOT deploy rules to production without explicit institutional authorization).*
- [ ] **5. Required Test Accounts Exist:** Dedicated test accounts (`@talasys.test`) are provisioned in Firebase Auth and Firestore with correct roles.
- [ ] **6. Role Permissions Function:** Verified that View Only, Verifier, Document Processor, Manager, Full Admin, Super Admin, and Resident role boundaries are active.
- [ ] **7. Test Data Isolation Enforced:** All test records created during testing must use the `[TEST-QA]` prefix in names and notes.
- [ ] **8. Cloudinary Storage Functional:** Unsigned or authenticated upload presets are operational for ID verification photos, authorization letters, and signature assets.
- [ ] **9. Browser Inspection Available:** Browser DevTools (F12) Console and Network tabs are open to inspect client errors, network payloads, and response codes.
- [ ] **10. Safe Cleanup Procedure Understood:** Testers have reviewed Section A.5 and know how to clean up test records without mutating real data.

---

### 3. Test Account Roles Matrix

The following test account email addresses are illustrative fixtures to be provisioned on the target test environment.

> [!CAUTION]
> Never include passwords, private API keys, or active credentials in this documentation or in the repository. Verify that accounts exist on the target staging instance before executing role-gated tests.

| Role Name | Test Email (Illustrative) | Permissions & Workspace Scope |
|---|---|---|
| **Resident (Standard)** | `test.resident@talasys.test` | Full resident portal: document requests, payments, profile updates, notifications |
| **Resident (Unverified)** | `test.unverified@talasys.test` | Initial registration pending verification, rejected resubmission workflow |
| **Admin: View Only** | `admin.viewonly@talasys.test` | Read-only inspection of residents and requests; mutations blocked with HTTP 403 |
| **Admin: Verification Only** | `admin.verifier@talasys.test` | Verification portal: approve/reject registrations and profile change requests |
| **Admin: Document Processing** | `admin.processor@talasys.test` | Requests portal: review, payment confirmation, document generation, reprints |
| **Admin: Resident Management** | `admin.manager@talasys.test` | Residents portal: manage resident statuses, account review |
| **Admin: Full Access** | `admin.full@talasys.test` | Complete administrative workspace: residents, verifications, requests, reports |
| **Super Admin** | `superadmin@talasys.test` | Full institutional authority: system configuration, branding, admin accounts, audit logs |

---

### 4. Environment Variables Checklist (Secrets Redacted)

Verify that the following environment variables are present and configured in `.env.local` or the staging environment:

- `NEXT_PUBLIC_FIREBASE_API_KEY`: Configured
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Configured
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Configured
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Configured
- `FIREBASE_ADMIN_PROJECT_ID`: Configured
- `FIREBASE_ADMIN_CLIENT_EMAIL`: Configured
- `FIREBASE_ADMIN_PRIVATE_KEY`: Configured (Injected via secure environment secret)
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`: Configured
- `NEXT_PUBLIC_CLOUDINARY_API_KEY`: Configured
- `CLOUDINARY_API_SECRET`: Configured

---

### 5. Safe Fixture Cleanup Procedure

- All newly created test records must include the prefix `[TEST-QA]` in name, reference, and note fields.
- At the conclusion of test sessions, use administrative deletion controls (`admin.delete`, `verification.delete`) or run designated cleanup scripts against the staging database.
- **Never mutate, overwrite, or delete production resident records.**

---

## SECTION B — RESIDENT HANDS-ON SCENARIOS

All resident routes correspond directly to the Next.js App Router structure:
- Registration: `/auth/register`
- Login: `/auth/login`
- Resident Dashboard: `/resident/dashboard`
- Resident Profile: `/resident/profile`
- Request Document: `/resident/request`
- Request History & Tracking: `/resident/history`
- Notifications: `/resident/notifications`

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-RES-01** | Resident | Browser on registration page `/auth/register` | 1. Enter valid resident info with prefix `[TEST-QA]`.<br>2. Upload valid ID photo.<br>3. Submit registration. | Form validates successfully; confirmation screen displays; application enters "Pending" status in Firestore. | | NOT RUN | | | |
| **TC-RES-02** | Resident | Registered account | 1. Open verification email link.<br>2. Complete email verification. | Account emailVerified is marked true; user is directed to login page. | | NOT RUN | | | |
| **TC-RES-03** | Resident | Verified account | 1. Go to `/auth/login`.<br>2. Enter credentials.<br>3. Click Sign Out in dashboard. | Login directs to `/resident/dashboard`; session tokens stored safely; Sign Out clears session and returns to login. | | NOT RUN | | | |
| **TC-RES-04** | Resident | Logged in as Resident | 1. Navigate to `/resident/profile`.<br>2. Inspect profile fields. | Full profile details (name, address, contact, verification badge) display cleanly without data truncation. | | NOT RUN | | | |
| **TC-RES-05** | Resident | Verified resident profile | 1. Click "Request Profile Edit".<br>2. Change address.<br>3. Upload proof.<br>4. Submit. | Profile change request enters pending verifications queue; dashboard reflects pending verification lock. | | NOT RUN | | | |
| **TC-RES-06** | Resident | Account with rejected verification | 1. Login with rejected account.<br>2. Review rejection reason.<br>3. Upload clearer proof.<br>4. Resubmit. | Resubmission replaces rejected proof; prior operationId preserved; verification transitions back to "pending". | | NOT RUN | | | |
| **TC-RES-07** | Resident | Active resident with zero pending requests | 1. Navigate to `/resident/request`.<br>2. Select "Barangay Clearance".<br>3. Select "For Myself".<br>4. Enter Purpose: "Employment".<br>5. Select "Cash on Pick-up".<br>6. Submit. | Request created with status "Pending"; reference number generated; request visible in Request History (`/resident/history`). | | NOT RUN | | | |
| **TC-RES-08** | Resident | New document request on `/resident/request` | 1. Select document with fee > 0.<br>2. Choose "Cash on Pick-up" payment.<br>3. Submit. | Payment status is "unpaid"; instructions indicate cash payment at barangay treasury upon pickup; request visible in `/resident/history`. | | NOT RUN | | | |
| **TC-RES-09** | Resident | New document request on `/resident/request` | 1. Select document with fee > 0.<br>2. Choose "GCash" payment.<br>3. Enter GCash Ref Number.<br>4. Upload receipt screenshot proof.<br>5. Submit. | Payment status is "pending_verification"; uploaded receipt proof is securely recorded in database; request visible in `/resident/history`. | | NOT RUN | | | |
| **TC-RES-10** | Resident | Active resident requesting document with fee > 0 (Pay Later administrative lifecycle) | 1. Navigate to `/resident/request`.<br>2. Select document with fee > 0 (e.g. Barangay Clearance, 50 PHP).<br>3. Select "Cash on Pick-up" payment.<br>4. Submit request.<br>5. In Admin portal (`/admin/requests`), inspect the new request. | Request created with `paymentStatus: "unpaid"`. In Admin portal (`/admin/requests` and `/admin/requests/payments`), the request displays the administrative "Pay Later" badge, indicating that treasury collection is required before completion. *(Note: Pay Later is an administrative workflow for unpaid cash requests, not a distinct resident-form radio option).* | | NOT RUN | | | |
| **TC-RES-11** | Resident | Active resident on `/resident/request` | 1. Select document.<br>2. Select "On Behalf of Another Person".<br>3. Enter beneficiary name "Pedro Santos", address "456 Mabini St", age 25, contact, relationship.<br>4. Upload Authorization Letter.<br>5. Submit. | Request stores `requestFor: 'other'`, `requestedByName: 'Pedro Santos'`, `representedAddress: '456 Mabini St'`, `representedAge: 25`; `beneficiaryReviewStatus` is 'provided'. | | NOT RUN | | | |
| **TC-RES-12** | Resident | Pending request | 1. Go to `/resident/history`.<br>2. Select pending request card.<br>3. Click "Cancel Request".<br>4. Confirm cancellation. | Request status transitions to "Cancelled"; terminal state locks further edits; status timestamp recorded. | | NOT RUN | | | |
| **TC-RES-13** | Resident | Resident with multiple requests | 1. Open `/resident/history`.<br>2. Filter by status (All, Pending, On Process, Completed) or search by keyword.<br>3. Click "Track" on a request. | Requests filter accurately; status tracker modal displays timeline, payment status, and reference details. | | NOT RUN | | | |
| **TC-RES-14** | Resident | Request rejected by admin | 1. Open `/resident/history`.<br>2. Locate rejected request.<br>3. Click "Retry".<br>4. System navigates to `/resident/request?type=...&retry=...` prefilling details.<br>5. Correct requested details and submit. | Fresh request created with updated details; duplicate key collision prevented; prior rejection preserved in history. | | NOT RUN | | | |
| **TC-RES-15** | Resident | Active resident | 1. Check notification bell in header or open `/resident/notifications` panel.<br>2. Click "Mark as Read". | Real-time notifications for status changes display accurately; badge count decrements on read. | | NOT RUN | | | |

---

## SECTION C — ADMIN HANDS-ON SCENARIOS

All administrative routes correspond directly to the Next.js App Router structure:
- Dashboard: `/admin/dashboard`
- Residents: `/admin/residents`
- Verifications: `/admin/verifications`
- Requests: `/admin/requests`
- Payment Review: `/admin/requests/payments`
- Document Generator: `/admin/generate?requestId=...`
- Notifications: `/admin/notifications`
- Audit Logs: `/admin/logs`
- Reports: `/admin/reports`

> [!NOTE]
> **Stationery & Letterhead Arrangement:** The document generator on `/admin/generate` intentionally omits the official barangay header and seal graphic because the barangay uses physical preprinted letterhead stationery. The generator outputs clean document body text, reference metadata, issuance date, and official e-signatures positioned to align with preprinted letterhead.

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-ADM-01** | Full Access | Logged in as Admin | 1. Open `/admin/dashboard`.
2. Check metric cards (Active Requests, Pending Verifications, Today's Issuances). | Metrics match actual counts in Firestore; navigation drawer renders appropriate workspace links. | | NOT RUN | | | |
| **TC-ADM-02** | Resident Mgmt | Logged in as Manager | 1. Open `/admin/residents`.
2. Search resident by name/email.
3. Filter by "Active" / "Pending". | Filter returns matching records instantly; clicking resident opens complete identity profile card. | | NOT RUN | | | |
| **TC-ADM-03** | Verifier | Logged in as Verifier | 1. Open `/admin/verifications`.
2. Open pending registration.
3. Click "Approve".
4. Confirm. | Resident status becomes "Active"; `isVerified: true`; notification dispatched to resident; audit log created. | | NOT RUN | | | |
| **TC-ADM-04** | Document Proc | Logged in as Processor | 1. Open `/admin/requests`.
2. Select Pending request.
3. Click "Approve Request". | Request status transitions to "Approved"; status timestamp recorded; resident receives approval notification. | | NOT RUN | | | |
| **TC-ADM-05** | Document Proc | Request with pending payment | 1. In `/admin/requests` or `/admin/requests/payments`, select request with unpaid fee.
2. Click "Confirm Payment" / "Review Payment".
3. Select Cash or verify GCash proof and enter receipt details.
4. Submit. | Payment status becomes "paid"; request status advances to "On Process"; receipt number generated; audit event logged. | | NOT RUN | | | |
| **TC-ADM-06** | Document Proc | Approved direct request | 1. In `/admin/requests`, click "Generate" or open `/admin/generate?requestId=...`.
2. Preview document on canvas.
3. Verify resident name & address.
4. Click "Download PDF" (or "Print Document"). | Document renders with correct resident details and official e-signatures (header/seal omitted for preprinted stationery); `hasGenerated: true` is recorded in Firestore; PDF downloads or print dialog opens. | | NOT RUN | | | |
| **TC-ADM-07** | Document Proc | Approved on-behalf-of request (V03) | 1. Open `/admin/generate?requestId=...` for request with beneficiary "Pedro Santos".
2. Notice "Beneficiary Review Required" banner.
3. Click "Confirm Beneficiary".
4. Verify name matches requested beneficiary, confirm address & age.
5. Click "Download PDF". | Beneficiary confirmation succeeds; document resolver renders "Pedro Santos" with address and age; issuance snapshot records metadata in Firestore; `hasGenerated: true` recorded. | | NOT RUN | | | |
| **TC-ADM-08** | Document Proc | Generated document preview | 1. Click "Download PDF".
2. Open downloaded PDF in viewer. | PDF generates cleanly with crisp typography, correct dates, valid official signature images, and proper page margins tailored for preprinted official barangay letterhead. | | NOT RUN | | | |
| **TC-ADM-09** | Document Proc | Generated document preview | 1. Click "Print Document".
2. Check browser print preview dialog. | Print CSS applies cleanly: navigation bars and action buttons hidden; certificate body and signatures centered on standard legal/A4 page. | | NOT RUN | | | |
| **TC-ADM-10** | Document Proc | Completed request with previously issued document (MT01) | 1. Issue an approved document via `/admin/generate` ("Download PDF").
2. Mark request "Ready for Pick Up", then "Completed".
3. In `/admin/requests`, locate Completed request and click "Reprint" (or navigate to `/admin/generate?requestId=...`).
4. Verify "Archival Reprint Notice" banner and historical issuance details (original beneficiary name, address, age).
5. Click "Download Reprint PDF" or "Print Reprint".
6. Verify successful backend recording via `request.reprint` (toast confirms reprint).
7. Confirm request status remains strictly "Completed" (does not revert to On Process or Approved).
8. Confirm original `generatedAt` timestamp is preserved unchanged and `reprintCount` increments by 1. | Authorized reprint succeeds; status remains Completed; historical snapshot data is rendered intact; `reprintCount` increments by 1; `lastReprintedAt` updated; audit log records `Reprinted Document`. | | NOT RUN | | | |
| **TC-ADM-11** | Document Proc | Issued request | 1. Navigate to `/admin/requests`.
2. Click "Mark Ready for Pick Up".
3. Once collected, click "Mark Completed". | Request transitions to "Completed"; terminal state achieved; completed metric increments on dashboard. | | NOT RUN | | | |
| **TC-ADM-12** | Full Access | Logged in as Admin | 1. Open `/admin/notifications`.
2. Compose broadcast alert: "Barangay Assembly on Saturday".
3. Send broadcast. | Notification reaches all active residents; audit log records administrative announcement. | | NOT RUN | | | |
| **TC-ADM-13** | Full Access | Logged in as Admin | 1. Open `/admin/logs` or `/admin/reports`.
2. Filter by date and action type.
3. Export summary report. | Detailed audit events display accurate actorUid, IP address, timestamp, and action detail; export produces valid data. | | NOT RUN | | | |

---

## SECTION D — SUPER ADMIN HANDS-ON SCENARIOS

All superadmin routes correspond directly to the Next.js App Router structure:
- Dashboard: `/superadmin/dashboard`
- Admin Accounts: `/superadmin/admins`
- System Configuration: `/superadmin/config`
- Analytics: `/superadmin/analytics`
- Category Reports: `/superadmin/category-reports`
- Audit Trail: `/superadmin/audit`

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-SA-01** | Super Admin | Logged in as Super Admin | 1. Navigate to `/superadmin/admins`.
2. Click "Add Administrator".
3. Enter name, email, password, and role "Document Processing".
4. Submit. | Admin account created in Auth and Firestore; user listed with initial status "Active"; audit event recorded. | | NOT RUN | | | |
| **TC-SA-02** | Super Admin | Existing delegated admin | 1. Select admin account.
2. Change role to "View Only".
3. Save.
4. Login as that admin. | Admin can view pages but all mutation buttons are disabled or rejected with HTTP 403. | | NOT RUN | | | |
| **TC-SA-03** | Super Admin | Logged in as Super Admin | 1. Navigate to `/superadmin/config`.
2. Inspect Branding, Templates, and Document Types tabs. | Server configuration loads completely; current version number displayed; save button initially disabled (clean). | | NOT RUN | | | |
| **TC-SA-04** | Super Admin | Config Branding tab | 1. Edit Barangay Name to "Barangay San Antonio".
2. Edit Contact Number.
3. Notice "Unsaved Changes" indicator.
4. Click "Save All Changes". | Configuration persists with version increment; toast confirms save; dirty banner disappears. | | NOT RUN | | | |
| **TC-SA-05** | Super Admin | Config Branding tab | 1. Upload new Barangay Captain signature image.
2. Save changes.
3. Open document generator. | Signature uploaded to authenticated Cloudinary; generator preview displays newly configured signature. | | NOT RUN | | | |
| **TC-SA-06** | Super Admin | Config Document Types tab | 1. Change fee of "Barangay Clearance" from 50 to 75.
2. Save changes. | Fee updates in database; resident request modal reflects new fee (75 PHP). | | NOT RUN | | | |
| **TC-SA-07** | Super Admin | Config Document Types tab | 1. Toggle switch to disable "Funeral Certification".
2. Save changes.
3. Check resident request page. | Disabled document type is omitted or disabled in resident request dropdown. | | NOT RUN | | | |
| **TC-SA-08** | Super Admin | Config page (V01 Scenario A) | 1. Edit Contact Number to "02-8999-9999" (do NOT save).
2. Click "Add Custom Document".
3. Enter Name: "Business Permit Clearance", Fee: 150.
4. Submit modal. | Custom doc added and catalog persists; unsaved Contact Number remains in draft field; dirty state remains active! | | NOT RUN | | | |
| **TC-SA-09** | Super Admin | Config page (V01 Scenario B) | 1. Edit Barangay Clearance template text (do NOT save).
2. Delete the custom document type created in TC-SA-08.
3. Confirm deletion. | Custom document deleted from catalog; unsaved Barangay Clearance template draft remains intact and dirty! | | NOT RUN | | | |
| **TC-SA-10** | Super Admin | Two separate browser sessions | 1. Session A edits contact number (baseVersion 5).
2. Session B changes barangay name and saves (bumps server to version 6).
3. Session A attempts to save conflicting field. | Session A receives HTTP 409 conflict alert; local draft preserved; external change warning banner displayed. | | NOT RUN | | | |
| **TC-SA-11** | Super Admin | Logged in as Super Admin | 1. Navigate to `/superadmin/config` Backups tab.
2. Review automated backup log or trigger manual export. | Backup record generated with timestamp, collection list, and export status. | | NOT RUN | | | |
| **TC-SA-12** | Super Admin | Superadmin account | 1. Attempt to delete or demote own Super Admin account in `/superadmin/admins`. | Action blocked with error "Cannot modify or delete your own privileged account." | | NOT RUN | | | |

---

## SECTION E — NEGATIVE TESTING SCENARIOS

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-NEG-01** | Resident | Logged in as Resident | 1. Directly enter URL `http://localhost:3000/admin/dashboard` in browser. | Access denied; user redirected to `/resident/dashboard` or `/auth/login`; zero admin data exposed. | | NOT RUN | | | |
| **TC-NEG-02** | Resident | Resident request modal | 1. Attempt to forge request submission for a disabled document type via API. | Server rejects request with HTTP 400 "Selected document type is not available." | | NOT RUN | | | |
| **TC-NEG-03** | Resident | Resident request form | 1. Rapidly double-click or spam "Submit Request" button. | Client disables button during submission; idempotency key prevents duplicate request creation in Firestore. | | NOT RUN | | | |
| **TC-NEG-04** | Admin | Terminal request | 1. Open request in "Completed" or "Cancelled" status.
2. Attempt to update status or confirm payment. | Action buttons disabled; direct API attempt rejected with HTTP 409 "Cannot transition terminal request." | | NOT RUN | | | |
| **TC-NEG-05** | Admin | Unconfirmed on-behalf request (V03/F02) | 1. Open on-behalf request without prior staff confirmation.
2. Attempt to call markGenerated directly. | Generation blocked with HTTP 400 "Represented beneficiary details must be explicitly confirmed by staff." | | NOT RUN | | | |
| **TC-NEG-06** | Admin | Rejected request | 1. Select request with status "Rejected".
2. Attempt to generate or reprint certificate. | Operation rejected with HTTP 409 "Cannot mark generated for request in terminal state 'Rejected'." | | NOT RUN | | | |
| **TC-NEG-07** | Resident | Resident A account | 1. Resident A attempts to read or mutate Resident B's verification or request document via API. | Firestore rules and server endpoints enforce ownership; operation rejected with HTTP 403 PERMISSION_DENIED. | | NOT RUN | | | |
| **TC-NEG-08** | View Only | View Only Admin | 1. Logged in as View Only admin.
2. Attempt to call `request.updateStatus` or `resident.update` via DevTools fetch. | Server returns HTTP 403 "Caller is not authorized for this operation." Zero writes to Firestore. | | NOT RUN | | | |
| **TC-NEG-09** | Super Admin | Stale config baseVersion (V01) | 1. Send `system.config.update` with missing `baseVersion` or conflicting concurrent field values. | Server returns HTTP 400 or HTTP 409 with `conflictingFields`; server configuration remains unmutated. | | NOT RUN | | | |
| **TC-NEG-10** | Admin | Reissue corrected document (Backend-only API) | 1. Call backend API endpoint `/api/admin/operations` with `request.reissueCorrected` and correction reason less than 10 characters (e.g. "typo"). *(Note: Corrected reissuance is a backend API operation; no clickable UI control is exposed).* | Server rejects with HTTP 400 "Correction reason is required and must be at least 10 characters." | | NOT RUN | | | |
| **TC-NEG-11** | Admin | Unissued Completed request reprint (MT01) | 1. Attempt to execute `request.reprint` on a Completed request that was never previously generated (`hasGenerated: false`). | Server strictly rejects with HTTP 400 "Cannot reprint document: request has not been previously generated." Initial generation cannot bypass requirements via Completed status. | | NOT RUN | | | |

---

## SECTION F — RESPONSIVE VIEWPORT TESTING

Testers must inspect key pages across the following 5 standardized screen resolutions:

| Viewport Profile | Resolution | Target Device Category | Verification Focus | Status |
|---|---|---|---|---|
| **VP-01** | **360 × 800** | Compact Android (e.g., Samsung Galaxy S-series, A-series) | Mobile drawer menu, vertical form stacking, no horizontal overflow, readable touch targets (>= 44px), modal fits screen without cutoff. | NOT RUN |
| **VP-02** | **390 × 844** | Modern iPhone (iPhone 12/13/14/15) | Safe-area padding, bottom navigation bar, card padding, status badge alignment, input tap zoom prevention. | NOT RUN |
| **VP-03** | **768 × 1024** | Tablet Vertical (iPad 9.7", iPad Air) | Multi-column grid collapse, table horizontal scrolling or responsive cards, sidebar drawer toggle. | NOT RUN |
| **VP-04** | **1280 × 800** | Compact Laptop / Chromebook | Sidebar expanded state, metrics grid layout, document preview canvas fit, modal centering. | NOT RUN |
| **VP-05** | **1440 × 900** | Standard Desktop / Monitor | Full desktop layouts, wide data tables, split-screen document editor and preview, print preview rendering. | NOT RUN |

### Viewport Inspection Criteria:
1. **Zero Horizontal Overflow:** Body must not have unintentional horizontal scrollbar on any viewport.
2. **Navigation Accessibility:** Hamburger menu toggles smoothly; links are easily tappable.
3. **Modal Dialogs:** Modals must not extend beyond top/bottom viewport bounds; close buttons must remain clickable.
4. **Action Buttons:** "Download PDF", "Print Document", "Save Changes", and "Submit" must never be clipped or hidden.
5. **Form Controls:** Labels, inputs, select dropdowns, and file upload dropzones must resize cleanly without breaking layout.

---

## SECTION G — TEST EXECUTION & DEFECT LOGGING GUIDANCE

1. **Test Order:** Begin with Section A (Pre-flight confirmation), proceed through Section B (Resident), Section C (Admin), Section D (Super Admin), Section E (Negative), and Section F (Responsive Viewports).
2. **Evidence Recording:**
   - For all passing tests, record `Status: PASS` and note date/tester initials in `Actual Result`.
   - For any failing test, record `Status: FAIL`, assign severity (Critical / High / Medium / Low), capture screenshot or screen recording, and immediately log a defect entry in [`docs/HANDS_ON_DEFECT_REGISTER.md`](file:///c:/Users/Administrator/Downloads/TALASYS/docs/HANDS_ON_DEFECT_REGISTER.md).
3. **Non-Destructive Testing:** Test only with designated test accounts (`@talasys.test`). Do not attempt live destructive actions against institutional data.
4. **Acceptance Threshold:** All 56 test cases (15 Resident + 13 Admin + 12 Super Admin + 11 Negative + 5 Viewport) must reach `PASS` or documented `Accepted Limitation` before final institutional deployment.
