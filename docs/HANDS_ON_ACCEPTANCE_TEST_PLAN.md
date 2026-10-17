# TALASYS — Hands-On Acceptance Test Plan

**Document Version:** 1.0.0  
**Target Environment:** Local Staging / Deployed Acceptance Environment  
**Repository:** `jsphhbna/TALASYS`  
**Framework:** DevKit V9 RC10  
**Testing Execution Model:** Human manual execution with tabular evidence capture  

---

## SECTION A — TEST ENVIRONMENT READINESS

Prior to executing manual acceptance tests, the test coordinator and testers must complete the following readiness verification:

### 1. Deployment & Commit Synchronization
- **Application URL:** `http://localhost:3000` (Local Dev/Staging) or authorized staging URL.
- **Audited Commit SHA:** `62aa7598fe1233283d28e3e38b1faef340f4c1ab` (Intervening and final V01–V04 commits applied on `main`).
- **Git Synchronization Check:** Verify local repository branch matches `origin/main` with `git status` showing zero uncommitted changes and `ahead 0, behind 0`.
- **Source Verification:** Confirm that running container/process matches the compiled output of the audited commit. Do not assume GitHub synchronization implies live deployment.

### 2. Firebase & Database Environment
- **Firebase Project ID:** `talasys-acceptance-staging` (or local emulator `talasys-rules-test` / `talasys-e2e`).
- **Firestore Rules Verification:** Verify Firestore Security Rules (`firestore.rules`) match repository version.
  > [!WARNING]
  > Do not deploy or publish live Firestore Rules to production without explicit authorization from the system administrator.
- **Cloudinary Storage Configuration:** Ensure valid unsigned/authenticated upload presets and signing keys are provisioned for document proofs and official e-signatures.

### 3. Environment Variables Readiness Checklist (Secrets Redacted)
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Configured
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Configured
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Configured
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Configured
- `FIREBASE_ADMIN_PROJECT_ID`: Configured
- `FIREBASE_ADMIN_CLIENT_EMAIL`: Configured
- `FIREBASE_ADMIN_PRIVATE_KEY`: Configured (Private key safely injected via environment)
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`: Configured
- `NEXT_PUBLIC_CLOUDINARY_API_KEY`: Configured
- `CLOUDINARY_API_SECRET`: Configured

### 4. Test Account Roles Matrix
The following dedicated test accounts must be provisioned before testing starts:

| Role Name | Test Email | Permissions & Workspace Scope |
|---|---|---|
| **Resident (Standard)** | `test.resident@talasys.test` | Full resident portal: document requests, payments, profile updates, notifications |
| **Resident (Unverified)** | `test.unverified@talasys.test` | Initial registration pending verification, rejected resubmission workflow |
| **Admin: View Only** | `admin.viewonly@talasys.test` | Read-only inspection of residents and requests; mutations blocked with 403 |
| **Admin: Verification Only** | `admin.verifier@talasys.test` | Verification portal: approve/reject registrations and profile change requests |
| **Admin: Document Processing** | `admin.processor@talasys.test` | Requests portal: review, payment confirmation, document generation, reprints |
| **Admin: Resident Management** | `admin.manager@talasys.test` | Residents portal: manage resident statuses, account review |
| **Admin: Full Access** | `admin.full@talasys.test` | Complete administrative workspace: residents, verifications, requests, reports |
| **Super Admin** | `superadmin@talasys.test` | Full institutional authority: system configuration, branding, admin accounts, audit logs |

### 5. Safe Fixture Cleanup Procedure
- All newly created manual test records must use the prefix `[TEST-QA]` in names and notes.
- At the conclusion of test sessions, use administrative deletion workflows (`admin.delete`, `verification.delete`) or execute safe cleanup scripts against staging data.
- **Never mutate, overwrite, or delete real resident records.**

---

## SECTION B — RESIDENT HANDS-ON SCENARIOS

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-RES-01** | Resident | Browser on registration page `/auth/register` | 1. Enter valid resident info.<br>2. Upload valid ID photo.<br>3. Submit registration. | Form validates successfully; confirmation screen displays; application enters "Pending" status in Firestore. | | NOT RUN | | | |
| **TC-RES-02** | Resident | Registered account | 1. Open verification email link.<br>2. Complete email verification. | Account emailVerified is marked true; user is directed to login page. | | NOT RUN | | | |
| **TC-RES-03** | Resident | Verified account | 1. Go to `/auth/login`.<br>2. Enter credentials.<br>3. Click Sign Out in dashboard. | Login directs to `/resident/dashboard`; session tokens stored safely; Sign Out clears session and returns to login. | | NOT RUN | | | |
| **TC-RES-04** | Resident | Logged in as Resident | 1. Navigate to `/resident/profile`.<br>2. Inspect profile fields. | Full profile details (name, address, contact, verification badge) display cleanly without data truncation. | | NOT RUN | | | |
| **TC-RES-05** | Resident | Verified resident profile | 1. Click "Request Profile Edit".<br>2. Change address.<br>3. Upload proof.<br>4. Submit. | Profile change request enters pending verifications queue; dashboard reflects pending verification lock. | | NOT RUN | | | |
| **TC-RES-06** | Resident | Account with rejected verification | 1. Login with rejected account.<br>2. Review rejection reason.<br>3. Upload clearer proof.<br>4. Resubmit. | Resubmission replaces rejected proof; prior operationId preserved; verification transitions back to "pending". | | NOT RUN | | | |
| **TC-RES-07** | Resident | Active resident with zero pending requests | 1. Navigate to `/resident/requests/new`.<br>2. Select "Barangay Clearance".<br>3. Select "For Myself".<br>4. Enter Purpose: "Employment".<br>5. Select Cash.<br>6. Submit. | Request created with status "Pending"; reference number generated; request visible in Request History. | | NOT RUN | | | |
| **TC-RES-08** | Resident | New document request | 1. Select document with fee > 0.<br>2. Choose "Cash" payment.<br>3. Submit. | Payment status is "unpaid"; instructions indicate cash payment at barangay treasury upon pickup. | | NOT RUN | | | |
| **TC-RES-09** | Resident | New document request | 1. Choose "GCash" payment.<br>2. Enter GCash Ref Number.<br>3. Upload receipt proof.<br>4. Submit. | Payment status is "pending_verification"; uploaded receipt proof is securely recorded in database. | | NOT RUN | | | |
| **TC-RES-10** | Resident | New document request | 1. Select document fee > 0.<br>2. Choose "Pay Later" option.<br>3. Submit. | Request accepted; payment status marked "unpaid" with "pay_later" flag; fee due before completion. | | NOT RUN | | | |
| **TC-RES-11** | Resident | Active resident | 1. Request document.<br>2. Select "On Behalf of Another Person".<br>3. Enter beneficiary name "Pedro Santos", address "456 Mabini St", age 25.<br>4. Upload Auth Letter.<br>5. Submit. | Request stores `requestFor: 'other'`, `requestedByName: 'Pedro Santos'`; beneficiaryReviewStatus is 'provided'. | | NOT RUN | | | |
| **TC-RES-12** | Resident | Pending request | 1. Go to `/resident/requests`.<br>2. Select pending request.<br>3. Click "Cancel Request".<br>4. Confirm. | Request status transitions to "Cancelled"; terminal state locks further edits; status timestamp recorded. | | NOT RUN | | | |
| **TC-RES-13** | Resident | Resident with multiple requests | 1. Open `/resident/requests`.<br>2. Filter by status (Pending, On Process, Completed). | Requests filter accurately; details modal shows timeline, payment status, and issuance receipt number. | | NOT RUN | | | |
| **TC-RES-14** | Resident | Request rejected by admin | 1. Open rejected request.<br>2. Click "Retry / Re-apply".<br>3. Correct requested details.<br>4. Submit. | New request references previous rejection context or reopens fresh request without duplicate key collision. | | NOT RUN | | | |
| **TC-RES-15** | Resident | Active resident | 1. Check notification bell in header.<br>2. Open notifications panel.<br>3. Click "Mark as Read". | Real-time notifications for status changes display accurately; badge count decrements on read. | | NOT RUN | | | |

---

## SECTION C — ADMIN HANDS-ON SCENARIOS

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-ADM-01** | Full Access | Logged in as Admin | 1. Open `/admin/dashboard`.<br>2. Check metric cards (Active Requests, Pending Verifications, Today's Issuances). | Metrics match actual counts in Firestore; navigation drawer renders appropriate workspace links. | | NOT RUN | | | |
| **TC-ADM-02** | Resident Mgmt | Logged in as Manager | 1. Open `/admin/residents`.<br>2. Search resident by name/email.<br>3. Filter by "Active" / "Pending". | Filter returns matching records instantly; clicking resident opens complete identity profile card. | | NOT RUN | | | |
| **TC-ADM-03** | Verifier | Logged in as Verifier | 1. Open `/admin/verifications`.<br>2. Open pending registration.<br>3. Click "Approve".<br>4. Confirm. | Resident status becomes "Active"; `isVerified: true`; notification dispatched to resident; audit log created. | | NOT RUN | | | |
| **TC-ADM-04** | Document Proc | Logged in as Processor | 1. Open `/admin/requests`.<br>2. Select Pending request.<br>3. Click "Approve Request". | Request status transitions to "Approved"; status timestamp recorded; resident receives approval notification. | | NOT RUN | | | |
| **TC-ADM-05** | Document Proc | Request with pending payment | 1. Select request with unpaid fee.<br>2. Click "Confirm Payment".<br>3. Select Cash and enter receipt details.<br>4. Submit. | Payment status becomes "paid"; request status advances to "On Process"; receipt number generated. | | NOT RUN | | | |
| **TC-ADM-06** | Document Proc | Approved direct request | 1. Navigate to `/admin/generate?requestId=...`.<br>2. Preview document.<br>3. Verify resident name & address.<br>4. Click "Generate Document". | Document renders with correct resident details, barangay header, and e-signatures; `hasGenerated: true`. | | NOT RUN | | | |
| **TC-ADM-07** | Document Proc | Approved on-behalf-of request (V03) | 1. Open generate page for request with beneficiary "Pedro Santos".<br>2. Click "Confirm Beneficiary".<br>3. Verify name matches requested beneficiary.<br>4. Confirm address & age.<br>5. Generate. | Confirmation succeeds; document resolver outputs "Pedro Santos"; issuance snapshot records name, address, and age. | | NOT RUN | | | |
| **TC-ADM-08** | Document Proc | Generated document preview | 1. Click "Download PDF".<br>2. Open downloaded PDF in viewer. | PDF generates cleanly with official seal, clean typography, correct dates, and valid signature images. | | NOT RUN | | | |
| **TC-ADM-09** | Document Proc | Generated document preview | 1. Click "Print Document".<br>2. Check browser print preview dialog. | Print CSS applies: navigation bars and action buttons hidden; certificate centered on standard legal/A4 page. | | NOT RUN | | | |
| **TC-ADM-10** | Document Proc | Previously issued request (V02) | 1. Open already-issued document (originally issued at Address A).<br>2. Verify banner indicates "Reprint Mode".<br>3. Click "Download PDF". | PDF strictly outputs Address A; `generatedAt` timestamp remains unchanged; `reprintCount` increments by 1. | | NOT RUN | | | |
| **TC-ADM-11** | Document Proc | Issued request | 1. Navigate to `/admin/requests`.<br>2. Click "Mark Ready for Pick Up".<br>3. Click "Mark Completed". | Request transitions to "Completed"; terminal state achieved; completed metric increments on dashboard. | | NOT RUN | | | |
| **TC-ADM-12** | Full Access | Logged in as Admin | 1. Open `/admin/notifications`.<br>2. Compose broadcast alert: "Barangay Assembly on Saturday".<br>3. Send broadcast. | Notification reaches all active residents; audit log records administrative announcement. | | NOT RUN | | | |
| **TC-ADM-13** | Full Access | Logged in as Admin | 1. Open `/admin/logs` or `/admin/reports`.<br>2. Filter by date and action type.<br>3. Export summary report. | Detailed audit events display accurate actorUid, IP address, timestamp, and action detail; export produces valid data. | | NOT RUN | | | |

---

## SECTION D — SUPER ADMIN HANDS-ON SCENARIOS

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-SA-01** | Super Admin | Logged in as Super Admin | 1. Navigate to `/superadmin/admins`.<br>2. Click "Add Administrator".<br>3. Enter name, email, password, and role "Document Processing".<br>4. Submit. | Admin account created in Auth and Firestore; user listed with initial status "Active"; audit event recorded. | | NOT RUN | | | |
| **TC-SA-02** | Super Admin | Existing delegated admin | 1. Select admin account.<br>2. Change role to "View Only".<br>3. Save.<br>4. Login as that admin. | Admin can view pages but all mutation buttons are disabled or rejected with HTTP 403. | | NOT RUN | | | |
| **TC-SA-03** | Super Admin | Logged in as Super Admin | 1. Navigate to `/superadmin/config`.<br>2. Inspect Branding, Templates, and Document Types tabs. | Server configuration loads completely; current version number displayed; save button initially disabled (clean). | | NOT RUN | | | |
| **TC-SA-04** | Super Admin | Config Branding tab | 1. Edit Barangay Name to "Barangay San Antonio".<br>2. Edit Contact Number.<br>3. Notice "Unsaved Changes" indicator.<br>4. Click "Save All Changes". | Configuration persists with version increment; toast confirms save; dirty banner disappears. | | NOT RUN | | | |
| **TC-SA-05** | Super Admin | Config Branding tab | 1. Upload new Barangay Captain signature image.<br>2. Save changes.<br>3. Open document generator. | Signature uploaded to authenticated Cloudinary; generator preview displays newly configured signature. | | NOT RUN | | | |
| **TC-SA-06** | Super Admin | Config Document Types tab | 1. Change fee of "Barangay Clearance" from 50 to 75.<br>2. Save changes. | Fee updates in database; resident request modal reflects new fee (75 PHP). | | NOT RUN | | | |
| **TC-SA-07** | Super Admin | Config Document Types tab | 1. Toggle switch to disable "Funeral Certification".<br>2. Save changes.<br>3. Check resident request page. | Disabled document type is omitted or disabled in resident request dropdown. | | NOT RUN | | | |
| **TC-SA-08** | Super Admin | Config page (V01 Scenario A) | 1. Edit Contact Number to "02-8999-9999" (do NOT save).<br>2. Click "Add Custom Document".<br>3. Enter Name: "Business Permit Clearance", Fee: 150.<br>4. Submit modal. | Custom doc added and catalog persists; unsaved Contact Number remains in draft field; dirty state remains active! | | NOT RUN | | | |
| **TC-SA-09** | Super Admin | Config page (V01 Scenario B) | 1. Edit Barangay Clearance template text (do NOT save).<br>2. Delete the custom document type created in TC-SA-08.<br>3. Confirm deletion. | Custom document deleted from catalog; unsaved Barangay Clearance template draft remains intact and dirty! | | NOT RUN | | | |
| **TC-SA-10** | Super Admin | Two separate browser sessions | 1. Session A edits contact number (baseVersion 5).<br>2. Session B changes barangay name and saves (bumps server to version 6).<br>3. Session A attempts to save conflicting field. | Session A receives HTTP 409 conflict alert; local draft preserved; external change warning banner displayed. | | NOT RUN | | | |
| **TC-SA-11** | Super Admin | Logged in as Super Admin | 1. Navigate to `/superadmin/config` Backups tab.<br>2. Review automated backup log or trigger manual export. | Backup record generated with timestamp, collection list, and export status. | | NOT RUN | | | |
| **TC-SA-12** | Super Admin | Superadmin account | 1. Attempt to delete or demote own Super Admin account in `/superadmin/admins`. | Action blocked with error "Cannot modify or delete your own privileged account." | | NOT RUN | | | |

---

## SECTION E — NEGATIVE TESTING SCENARIOS

| Test ID | Role | Preconditions | Steps | Expected Result | Actual Result | Status | Evidence | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| **TC-NEG-01** | Resident | Logged in as Resident | 1. Directly enter URL `http://localhost:3000/admin/dashboard` in browser. | Access denied; user redirected to `/resident/dashboard` or `/auth/login`; zero admin data exposed. | | NOT RUN | | | |
| **TC-NEG-02** | Resident | Resident request modal | 1. Attempt to forge request submission for a disabled document type via API. | Server rejects request with HTTP 400 "Selected document type is not available." | | NOT RUN | | | |
| **TC-NEG-03** | Resident | Resident request form | 1. Rapidly double-click or spam "Submit Request" button. | Client disables button during submission; idempotency key prevents duplicate request creation in Firestore. | | NOT RUN | | | |
| **TC-NEG-04** | Admin | Terminal request | 1. Open request in "Completed" or "Cancelled" status.<br>2. Attempt to update status or confirm payment. | Action buttons disabled; direct API attempt rejected with HTTP 409 "Cannot transition terminal request." | | NOT RUN | | | |
| **TC-NEG-05** | Admin | Unconfirmed on-behalf request (V03/F02) | 1. Open on-behalf request without prior staff confirmation.<br>2. Attempt to call markGenerated directly. | Generation blocked with HTTP 400 "Represented beneficiary details must be explicitly confirmed by staff." | | NOT RUN | | | |
| **TC-NEG-06** | Admin | Rejected request | 1. Select request with status "Rejected".<br>2. Attempt to generate certificate. | Operation rejected with HTTP 409 "Cannot mark generated for request in terminal state 'Rejected'." | | NOT RUN | | | |
| **TC-NEG-07** | Resident | Resident A account | 1. Resident A attempts to read or mutate Resident B's verification or request document via API. | Firestore rules and server endpoints enforce ownership; operation rejected with HTTP 403 PERMISSION_DENIED. | | NOT RUN | | | |
| **TC-NEG-08** | View Only | View Only Admin | 1. Logged in as View Only admin.<br>2. Attempt to call `request.updateStatus` or `resident.update` via DevTools fetch. | Server returns HTTP 403 "Caller is not authorized for this operation." Zero writes to Firestore. | | NOT RUN | | | |
| **TC-NEG-09** | Super Admin | Stale config baseVersion (V01) | 1. Send `system.config.update` with missing `baseVersion` or conflicting concurrent field values. | Server returns HTTP 400 or HTTP 409 with `conflictingFields`; server configuration remains unmutated. | | NOT RUN | | | |
| **TC-NEG-10** | Admin | Reissue corrected document (V02) | 1. Call `request.reissueCorrected` with correction reason less than 10 characters (e.g. "typo"). | Server rejects with HTTP 400 "Correction reason is required and must be at least 10 characters." | | NOT RUN | | | |

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
4. **Action Buttons:** "Generate Document", "Download PDF", "Save Changes", and "Submit" must never be clipped.
5. **Form Controls:** Labels, inputs, select dropdowns, and file upload dropzones must resize cleanly without breaking layout.

---

## SECTION G — TEST EXECUTION GUIDANCE FOR TESTERS

1. **Test Order:** Begin with Section A (Readiness), proceed through Section B (Resident), Section C (Admin), Section D (Super Admin), Section E (Negative), and Section F (Responsive).
2. **Evidence Recording:**
   - For all passing tests, record `Status: PASS` and note date/tester initials in `Actual Result`.
   - For any failing test, record `Status: FAIL`, assign severity (Critical / High / Medium / Low), capture screenshot or screen recording, and immediately log a defect entry in [`docs/HANDS_ON_DEFECT_REGISTER.md`](file:///c:/Users/Administrator/Downloads/TALASYS/docs/HANDS_ON_DEFECT_REGISTER.md).
3. **Non-Destructive Testing:** Test only with designated test accounts (`@talasys.test`). Do not attempt live destructive actions against institutional data.
