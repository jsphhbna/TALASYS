# TALASYS Issue Register (61 Findings)

| ID | Title | Milestone | Severity | Area | Affected Files | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| 1 | Super Admin Alerts & Signals semantics | D | Medium | Super Admin | `app/superadmin/dashboard/page.tsx`, `hooks/superadmin/use-superadmin-data.ts` | fixed and verified | None |
| 2 | Documents by Date Range button does nothing | E | Medium | Reports | `app/superadmin/reports/page.tsx` | fixed and verified | None |
| 3 | Resident Statistics includes invalid 1700s years | D | High | Admin Stats | `app/admin/residents/statistics/page.tsx` | fixed and verified | #15 |
| 4 | Reason Analytics Category filter is unwired | E | Medium | Analytics | `app/superadmin/analytics/page.tsx` | fixed and verified | #13 |
| 5 | Super Admin audit has fake pagination | E | Medium | Audit | `app/superadmin/audit/page.tsx` | fixed and verified | #14 |
| 6 | Production audit IP always shows localhost | D | Medium | Audit / Server | `app/superadmin/audit/page.tsx`, `hooks/superadmin/use-superadmin-data.ts`, `hooks/admin/use-admin-data.ts` | fixed and verified | None |
| 7 | Admin resident-list pagination is decorative | E | High | Admin Residents | `app/admin/residents/page.tsx` | fixed and verified | None |
| 8 | Custom reports ignore type, period and output format | E | High | Reports | `app/superadmin/reports/page.tsx` | fixed and verified | None |
| 9 | Other report cards also have no action | E | Medium | Reports | `app/superadmin/reports/page.tsx` | fixed and verified | #8 |
| 10 | Category report column options silently disappear | E | Medium | Reports | `app/superadmin/category-reports/page.tsx` | fixed and verified | None |
| 11 | Category growth and admin presence are fabricated | D | Medium | Category Reports / Admins | `app/superadmin/category-reports/page.tsx`, `hooks/superadmin/use-superadmin-data.ts`, `app/superadmin/admins/page.tsx` | fixed and verified | None |
| 12 | Empty Reason Analytics says one request was analyzed | E | Medium | Analytics | `app/superadmin/analytics/page.tsx` | fixed and verified | None |
| 13 | Reason breakdown can attach the wrong purpose label to a bar | E | High | Analytics | `app/superadmin/analytics/page.tsx`, `app/resident/request/page.tsx` | fixed and verified | None |
| 14 | History, statistics and exports silently stop at query limits | D | High | Shared Admin Data | `hooks/admin/use-admin-data.ts`, `hooks/superadmin/use-superadmin-data.ts` | fixed and verified | None |
| 15 | Audit timestamp types break sorting and activity charts | D | High | Audit / Data | `hooks/admin/use-admin-data.ts`, `hooks/superadmin/use-superadmin-data.ts`, `app/superadmin/audit/page.tsx`, `app/superadmin/admins/page.tsx` | fixed and verified | None |
| 16 | Admin Activity Logs can crash on valid shared audit entries | D | High | Audit / Logs | `app/admin/logs/page.tsx`, `hooks/admin/use-admin-data.ts` | fixed and verified | #15 |
| 17 | Expiry summaries and the Expiring filter cannot work correctly | D | High | Admin Residents | `hooks/admin/use-admin-data.ts`, `app/admin/residents/page.tsx`, `app/admin/residents/statistics/page.tsx` | fixed and verified | #55 |
| 18 | Verification History omits profile-edit and reactivation approvals/rejections | D | Medium | Verifications | `app/admin/verifications/history/page.tsx`, `hooks/admin/use-admin-data.ts` | fixed and verified | None |
| 19 | Today/This Week/Generated metrics use the wrong datasets | D | Medium | Metrics / Logs | `app/admin/logs/page.tsx`, `app/superadmin/audit/page.tsx`, `app/superadmin/reports/page.tsx` | fixed and verified | None |
| 20 | Resident history date controls do not filter its table | E | High | Resident History | `app/resident/history/page.tsx` | fixed and verified | None |
| 21 | Resident history can become blank after filtering on a later page | E | Medium | Resident History | `app/resident/history/page.tsx` | fixed and verified | #20 |
| 22 | Resident rejection actions and authorization viewer are unfinished | F | Medium | Resident History | `app/resident/history/page.tsx` | fixed and verified | #23 |
| 23 | Authorization letters are never uploaded with requests | F | High | Resident Requests | `app/resident/request/page.tsx`, `hooks/resident/use-resident-data.ts` | fixed and verified | #51, #52 |
| 24 | Resident dashboard Clearance quick action uses an unsupported type | F | Medium | Resident Dashboard | `app/resident/dashboard/page.tsx`, `app/resident/request/page.tsx` | fixed and verified | None |
| 25 | Resident request submission reports success before saving | F | High | Resident Requests | `app/resident/request/page.tsx` | fixed and verified | None |
| 26 | Resident cancellation, payment submission and account deletion conflict with rules | B | High | Security / Rules | `firestore.rules`, `hooks/resident/use-resident-data.ts` | fixed and verified | #55, #56 |
| 27 | New specialized Admin roles are inconsistent across UI, hooks and rules | B | High | RBAC / Admin | `hooks/superadmin/use-superadmin-data.ts`, `app/superadmin/admins/page.tsx`, `app/admin/layout.tsx`, `firestore.rules` | fixed and verified | #28 |
| 28 | View Only and limited Admin privileges are not enforced | B | Critical | RBAC / Security | `firestore.rules`, `app/admin/layout.tsx`, `components/admin/layout/admin-sidebar.tsx` | fixed and verified | #27 |
| 29 | User creation permits arbitrary roles and Admins can change privileged users | B | Critical | RBAC / Security | `firestore.rules`, `lib/auth/auth-context.tsx` | fixed and verified | #27, #28 |
| 30 | Locking an Admin does not revoke an existing session or backend permissions | B | High | RBAC / Auth | `lib/auth/auth-context.tsx`, `firestore.rules`, `hooks/auth/use-auth-guard.ts` | fixed and verified | #27 |
| 31 | Critical Super Admin mutations never appear in the audit/config-change log | D | High | Audit / SuperAdmin | `hooks/superadmin/use-superadmin-data.ts`, `app/superadmin/config/page.tsx`, `app/superadmin/admins/page.tsx` | fixed and verified | #15 |
| 32 | Site headers block the Resident camera feature | G | High | UI / Headers | `next.config.mjs` | fixed and verified | None |
| 33 | Camera streams and countdowns can survive modal closure | G | Medium | UI / Privacy | `components/resident/profile/profile-camera-modal.tsx` | fixed and verified | None |
| 34 | Custom modals lack keyboard and screen-reader dialog behavior | G | Medium | UI / A11y | `components/ui/modal-overlay.tsx`, consumers | fixed and verified | None |
| 35 | Admin and Super Admin layouts do not adapt to narrow screens | G | Medium | UI / Responsive | `components/admin/layout/admin-sidebar.tsx`, `components/superadmin/layout/superadmin-sidebar.tsx`, `components/admin/layout/admin-header.tsx`, `components/superadmin/layout/superadmin-header.tsx`, `components/layout/page-shells.tsx` | fixed and verified | None |
| 36 | Verification queue nests a button inside another button | G | Medium | UI / DOM | `components/admin/verif-review-page.tsx` | fixed and verified | None |
| 37 | Overdue verification badges use hardcoded November logic | G | Medium | UI / Logic | `components/admin/verif-review-page.tsx` | fixed and verified | None |
| 38 | Resident payment modal retains the previous request's data | F | Medium | UI / State | `components/resident/history/payment-modal.tsx` | fixed and verified | None |
| 39 | Resident details and documents can race between review targets | G | High | UI / Privacy | `components/admin/verif-review-page.tsx`, `components/admin/resident-profile-modal.tsx` | fixed and verified | None |
| 40 | Several success/error toasts have no mounted renderer | G | Medium | UI / Toasts | `app/layout.tsx` | fixed and verified | None |
| 41 | Save/review dialogs hide failed writes or become stuck | G | High | UI / State | `app/superadmin/config/page.tsx`, `components/admin/verif-review-page.tsx`, `components/admin/quick-review-modal.tsx` | fixed and verified | None |
| 42 | Approved profile-picture changes never update the user photo | F | High | Admin / Resident | `hooks/admin/use-admin-data.ts` | fixed and verified | #61 |
| 43 | Opening profile edit can silently remove a resident's voter category | F | Medium | Resident Profile | `app/resident/profile/page.tsx` | fixed and verified | None |
| 44 | Approved email edits change Firestore but not Firebase Auth | F | High | Identity / Auth | `hooks/admin/use-admin-data.ts`, `app/admin/residents/page.tsx`, `app/api/admin/update-resident-email/route.ts` | fixed and verified | None |
| 45 | Cancelled requests are shown as Under Review in tracking | F | Medium | Resident History | `components/resident/history/request-status-tracker-modal.tsx` | fixed and verified | #26 |
| 46 | Data-fetch errors are presented as genuine empty results | G | Medium | UI / Error Handling | `hooks/admin/use-admin-data.ts`, `components/superadmin/layout/backup-history-list.tsx`, `hooks/resident/use-resident-data.ts`, `hooks/superadmin/use-superadmin-data.ts` | fixed and verified | None |
| 47 | Required verification files can be missing despite a successful submission | F | High | Workflow / Upload | `app/auth/register/page.tsx`, `app/resident/profile/page.tsx`, `hooks/resident/use-resident-data.ts` | fixed and verified | #51 |
| 48 | Rejected registration resubmission uses a profile-edit path that cannot verify the account | F | High | Workflow / Identity | `components/resident/profile/profile-proofs-card.tsx`, `hooks/admin/use-admin-data.ts`, `hooks/resident/use-resident-data.ts` | fixed and verified | #61 |
| 49 | Expired residents are told to request reactivation but have no reactivation action | F | High | Resident Workflow | `app/resident/dashboard/page.tsx`, `app/resident/profile/page.tsx`, `hooks/resident/use-resident-data.ts`, `hooks/admin/use-admin-data.ts` | fixed and verified | #17 |
| 50 | Document generator has a stored HTML/script injection path | C | High | Security / XSS | `app/admin/generate/page.tsx` | fixed and verified | None |
| 51 | Upload-signing endpoint signs anonymous and unvalidated requests | C | High | Security / API | `app/api/cloudinary/sign/route.ts` | fixed and verified | None |
| 52 | Sensitive evidence and official signatures use public media delivery | C | High | Security / Privacy | `lib/resident/cloudinary.ts` | fixed and verified | #51 |
| 53 | Backup places a privileged bearer token in a GET URL | C | High | Security / API | `app/superadmin/config/page.tsx`, `app/api/backup/download/route.ts` | fixed and verified | None |
| 54 | Client-side bootstrap creates privileged accounts from public defaults | B | Critical | Security / Auth | `lib/auth/auth-context.tsx`, `lib/constants.ts` | fixed and verified | None |
| 55 | Owners can alter account expiry and verified demographic fields directly | B | High | Security / Rules | `firestore.rules` | fixed and verified | #29 |
| 56 | Residents can forge request status/payment metadata on creation or erase processed requests | B | High | Security / Rules | `firestore.rules` | fixed and verified | #26 |
| 57 | Verification creation and deletion do not protect review integrity | B | High | Security / Rules | `firestore.rules` | fixed and verified | None |
| 58 | Any authenticated account can impersonate official notifications | B | High | Security / Rules | `firestore.rules` | fixed and verified | None |
| 59 | Admin inactivity timeout skips almost every named Admin role | B | Medium | Security / Session | `hooks/auth/use-inactivity-timeout.ts` | fixed and verified | #27 |
| 60 | Locked dependencies have known advisory matches | C | High | Security / Dependencies | `package.json`, `package-lock.json` | fixed and verified | None |
| 61 | Approval and account provisioning can leave inconsistent records | B | High | Security / Integrity | `hooks/admin/use-admin-data.ts`, `lib/resident/local-storage-store.ts` | fixed and verified | None |

---

### Detailed Issue Breakdown & Remediation Specifications

Each issue includes affected files, root cause, required repair, and test verification strategy:

- **#1 Super Admin Alerts & Signals semantics**: `systemAlerts` collection has no producer; empty collection masquerades as system health. Provide explicit monitored conditions (pending verifications backlog, overdue requests, system errors) or truthful status indicator and empty-state messaging.
- **#2 Documents by Date Range button**: Unbound click handler in `app/superadmin/reports/page.tsx`. Add date range picker with Asia/Manila boundaries, validate start <= end, generate report.
- **#3 Resident Statistics 1700s years**: `createdAt.toString().slice(0, 4)` extracts first digits from epoch string (e.g. `1790000000000`). Parse via `new Date()` or Firestore Timestamp, validate reasonable year range (e.g. 2000-2100).
- **#4 Reason Analytics Category filter**: Dropdown static and unhandled. Populate dynamic categories, bind state, filter charts/tables.
- **#5 Super Admin audit pagination**: Static `Showing 1–10` text and inactive buttons. Wire real client/query pagination with sync across filters.
- **#6 Production audit IP localhost fallback**: Client hooks hardcode or fall back to `localhost`. Extract IP via server boundary headers (`x-forwarded-for` / trusted proxy), label historical missing as "Unknown".
- **#7 Admin resident-list pagination**: Table renders all records; footer is static. Implement true pagination slice and control handlers.
- **#8 Custom reports type/period/format**: Form selects ignore Report Type, Period, and Format (PDF vs CSV). Generate dynamic report matching selected format and criteria.
- **#9 Other report cards inactive**: Population cards and Rejected Requests cards have no handlers. Wire to specific generators or label clearly.
- **#10 Category report column options**: `Expiry Date` and `Other Categories` options in UI are omitted from export headers and columns. Include in generator.
- **#11 Category growth & admin presence**: Fixed `+2.1%` growth percentages and hardcoded `isOnline: false, lastActive: 'Never'`. Compute real metrics or mark as unsupported/unavailable.
- **#12 Empty Reason Analytics zero count**: Denominator fallback `(total || 1)` is rendered as `Total Analyzed: 1` when total is 0. Separate display count from division guard.
- **#13 Reason breakdown purpose labels**: Slots `cat0`, `cat1`, `cat2` labeled with global top purposes instead of per-category purposes; restricted to 3 legacy document names; filter has `|| true`. Fix color mapping and support all document types.
- **#14 Query limits truncate exports/stats**: `limit(200)` and `limit(100)` applied directly to full exports and historical stats. Decouple paginated view queries from un-truncated report aggregates.
- **#15 Audit timestamp string vs number**: Admin writes string timestamp, Superadmin writes number. Lexicographic sorting breaks chronological order. Normalize to canonical numeric epoch (or Timestamp) across all writers and readers.
- **#16 Admin activity logs crash**: `log.action.split` crashes when `action` is undefined (some writers save `actionType`). Add schema fallback.
- **#17 Expiry summaries and Expiring filter**: `use-admin-data.ts` only sets `Expired` or `Verified`; `Expiring` count is always 0. Implement 30-day expiring threshold logic.
- **#18 Verification History missing types**: Filter matches string `"Verification"`, omitting `"Approved Profile Edit"` and `"Approved Reactivation"`. Filter by structured action domain/type.
- **#19 Metric date boundaries wrong**: Today/This Week counters count all loaded logs instead of applying calendar boundaries; total documents generated includes pending/rejected. Fix date ranges and status filters.
- **#20 Resident history table date filter**: Year/month dropdown filters summary cards but table ignores it. Apply date filter to table rows and pagination.
- **#21 Resident history blank on later page**: Changing filters leaves `currentPage` on page 3 when only 1 record matches. Reset page on filter changes.
- **#22 Resident rejection details & authorization viewer**: Placeholder buttons with no onClick. Implement rejection details modal and file viewer/downloader.
- **#23 Authorization letter upload**: File is selected but only filename is saved; file is never uploaded to storage. Upload file and store durable reference URL.
- **#24 Resident dashboard Clearance type shortcut**: Shortcut passes `type=clearance`, which doesn't match `barangay-clearance` or configured type ID. Align shortcut IDs.
- **#25 Request submission async await**: `processSubmit` doesn't `await addRequest`, toast fires prematurely and errors are swallowed. Properly await and handle errors.
- **#26 Resident rules conflict**: Resident operations update status/paymentStatus, which `firestore.rules` rejects. Provide validated transitions in rules or server endpoints.
- **#27 Admin specialized roles**: UI offers specialized roles (`Resident Management`, `Verifications`, `Document Processing`), but admin filtering and rules reject them. Establish canonical role matrix.
- **#28 View Only admin privileges**: Rules allow all admin roles full write access. Enforce read-only and domain-scoped permissions in rules.
- **#29 User creation arbitrary roles**: Rules allow user create without role restriction, and admins can change any user's role. Restrict resident self-creation to `resident` role; restrict admin role edits.
- **#30 Locked admin session revocation**: Locking an admin doesn't kick active session or block rules. Add active status check in rules and real-time auth listener.
- **#31 Super Admin audit missing mutations**: Admin lock/delete/role change and config update omit audit logs. Add audit events for all critical mutations.
- **#32 Camera Permissions-Policy header**: `next.config.mjs` sets `camera=()`. Change to `camera=(self)` to enable camera capture.
- **#33 Camera stream cleanup**: Stream tracks and interval timers survive modal closure/unmount. Track refs and call `stop()` on all tracks.
- **#34 Custom modal accessibility**: `ModalOverlay` lacks `role="dialog"`, `aria-modal="true"`, focus trap, and Escape listener. Refactor to Radix Dialog primitive.
- **#35 Responsive sidebar/layout**: Fixed 232px sidebar breaks mobile screens (390px). Implement responsive drawer/collapsible navigation.
- **#36 Nested interactive buttons**: `<button>` containing `<Button>` in verification queue causes hydration and click bugs. Separate outer row from action button.
- **#37 Overdue verification hardcoded November**: Date comparison strips `Nov` and checks day > 25. Compare against current date (`Date.now() - 3 days`).
- **#38 Payment modal stale state**: Form state persists across different requests. Reset reference, payment tab, and file preview when request ID changes.
- **#39 Review modal async race**: Switching residents rapidly displays data from previous async fetch. Cancel stale requests or guard with active ID token.
- **#40 Missing Sonner toast renderer**: Several pages use `sonner.toast` but `app/layout.tsx` doesn't mount `<Toaster />`. Add Sonner Toaster.
- **#41 Save/review unhandled promises**: Unawaited async mutations hide errors and leave spinner stuck. Await mutations with proper try/catch/finally.
- **#42 Profile picture update not applied**: Approving profile edit with new photo never updates `users.profilePicture`. Apply photo URL on approval.
- **#43 Voter category dropped on profile edit**: Profile edit initializes categories from single `status` string instead of `statuses` array. Preserve existing categories.
- **#44 Email change desync**: Admin changing email only updates Firestore, not Firebase Auth. Provide coordinated auth update or remove direct email edit.
- **#45 Cancelled request status tracker**: Cancelled status falls back to "Pending" / "Under Review". Add explicit "Cancelled" step/status.
- **#46 Fetch errors masked as empty**: Firestore listener errors are silently caught; UI displays "No items found". Expose error state with retry button.
- **#47 Verification submission without required files**: File upload errors are swallowed and submission proceeds with empty URLs. Validate all required files before submission.
- **#48 Rejected registration resubmission**: Resubmission creates profile-edit verification which doesn't mark resident verified upon approval. Create registration-type verification.
- **#49 Expired resident reactivation**: Inactive residents told to request reactivation, but no button/form exists. Add reactivation request flow.
- **#50 Document generator stored XSS**: Resident address and purpose inserted via unescaped string interpolation into `innerHTML`. Escape and sanitize input.
- **#51 Unauthenticated upload signing**: `/api/cloudinary/sign` signs arbitrary caller timestamps without auth or rate limiting. Validate auth token, limit purpose, validate timestamp.
- **#52 Public delivery of sensitive evidence**: ID photos and signatures use public Cloudinary delivery URLs. Protect sensitive media delivery.
- **#53 Backup token in GET URL**: Backup export passes Bearer token in query string `?token=...`. Use `POST` with `Authorization: Bearer` header.
- **#54 Hardcoded client bootstrap superadmin**: Client bundle contains hardcoded superadmin credentials and auto-creates account. Remove client credentials; use secure setup.
- **#55 Owner can alter expiry & demographic fields**: Rules allow residents to update `accountExpiry`, `statuses`, `name`, `address`. Restrict owner updates to non-demographic fields.
- **#56 Request status/fee tampering**: Rules allow resident to set arbitrary `status`, `paymentStatus`, `documentFee` on creation. Validate initial values in rules.
- **#57 Verification forgeability**: Residents can create verifications with `status="Approved"`. Enforce `status="Pending"` on creation in rules.
- **#58 Impersonated notifications**: Any auth user can write to `/notifications`. Restrict notification creation to authorized operations.
- **#59 Inactivity timeout role mismatch**: Timeout hook only checks lowercase `admin` / `superadmin`. Check all canonical admin roles.
- **#60 Dependency vulnerabilities**: Locked dependencies (`next`, `xlsx`, `sharp`, `protobufjs`). Update dependencies safely and mitigate unpatched components.
- **#61 Lack of atomic transactions**: Verification approval updates verification, user, and logs in separate uncoordinated writes. Use Firestore `writeBatch` or transactions.
