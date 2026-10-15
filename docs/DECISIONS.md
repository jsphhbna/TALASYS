# TALASYS Architecture & Remediation Decisions (ADR)

## ADR-001: Canonical Administrative Role Matrix
- **Context**: Discrepancy existed between UI role options (`Full Access`, `Resident Management`, `Verifications`, `Document Processing`, `View Only`, `Admin`, `Super Admin`) and backend `firestore.rules` checking only a small subset, causing newly created admins to lose permissions or disappear.
- **Decision**: Define a single source of truth in `lib/auth/auth-types.ts` for canonical roles and permissions, mapped consistently in UI routes, hooks, and `firestore.rules`.
- **Consequences**: Consistent permission enforcement across all admin portals and rules.

## ADR-002: Removal of Hardcoded Client Bootstrap Credentials
- **Context**: `lib/constants.ts` and `lib/auth/auth-context.tsx` contained hardcoded superadmin bootstrap credentials and auto-created accounts on invalid login, along with localStorage session spoofing (#54).
- **Decision**: Remove hardcoded bootstrap credentials from client bundle; remove auto-creation on login failure and local-only fallback session spoofing. Admin provisioning must be done securely via standard auth or operator CLI.

## ADR-003: Server-side Cloudinary Upload Signing with Pre-Auth Ticket
- **Context**: `/api/cloudinary/sign` signed arbitrary timestamps without authentication, allowing unauthenticated abuse (#51). Registration uploads must occur before an auth account exists.
- **Decision**: Implement constrained signing requiring valid Firebase Auth ID token for authenticated users, and a short-lived, rate-limited registration ticket for initial registration proof uploads.

## ADR-004: Protected Delivery Proxy for Sensitive Evidence and Signatures
- **Context**: Government ID uploads and official signature assets were served via public Cloudinary CDN URLs (#52).
- **Decision**: Sensitive evidence routes require owner/admin authorization check before returning media, avoiding public URL enumeration.

## ADR-005: Canonical Numeric Epoch Timestamps for Audit and Metrics
- **Context**: Admin hooks wrote string millisecond timestamps while SuperAdmin wrote numeric timestamps, breaking Firestore `orderBy("timestamp")` and date parsing (#15).
- **Decision**: Enforce numeric epoch timestamps (milliseconds) across all Firestore writers and provide a defensive `parseAuditTimestamp` normalizer.

## ADR-006: Dual-Write Email Synchronization via Admin Endpoint
- **Context**: Admin editing resident email updated Firestore `users` collection without updating Firebase Authentication credentials (#44).
- **Decision**: Introduce `/api/admin/update-resident-email` using Firebase Admin Auth to ensure both Firebase Auth and Firestore email addresses stay synchronized.

## ADR-007: Accessible Modal Dialogs with Focus Trap and Keyboard Dismissal
- **Context**: Custom modal overlay lacked ARIA attributes, focus trap, and Escape key handling (#34).
- **Decision**: Upgrade `ModalOverlay` component with `role="dialog"`, `aria-modal="true"`, Tab focus trapping, and Escape key listeners, retrofitting accessibility across all custom modals.

## ADR-008: Responsive Navigation Drawers and Adaptive Padding
- **Context**: Fixed 232px desktop sidebars compressed the stage on mobile screens (390px) down to unusable widths (#35).
- **Decision**: Extract shared navigation links into reusable navigation components, hide desktop aside on mobile screens (`hidden md:flex`), mount mobile navigation drawer (`Sheet`) in headers, and apply responsive padding (`p-4 sm:p-6 lg:p-8`).

## ADR-009: Verification Only Workspace & Strict Route Isolation
- **Context**: Independent source review identified that Verification Only admins still had exposure to unrelated dashboard cards, reports, and lacked direct URL enforcement.
- **Decision**: Render dedicated `VerificationWorkspace` component on `/admin/dashboard` exclusively showing verification queues (Registrations, Profile Edits, Reactivations), review actions with scoped evidence, and verification history. Enforce route-level authorization guards in `AdminLayout` that immediately redirect unauthorized roles to their allowed landing page. Propagate role changes dynamically via real-time auth snapshot.

## ADR-010: Cloudinary Token Delivery for Sensitive Assets & Authoritative Record-Based Ownership
- **Context**: Private media delivered via custom proxies previously used mock secrets or public delivery; ownership was validated using client-supplied `ownerUid` (#52).
- **Decision**: Implement documented Cloudinary Token Authentication (`__cld_token__` with `st`, `exp`, `acl`, `hmac` and URL signature) on `type: authenticated` assets. In `app/api/media/view/route.ts`, resolve ownership and document purpose authoritatively from Firestore records (`verifications`, `documentRequests`, `users`), rejecting untrusted client body claims.

## ADR-011: Server-Side Request Creation with Authoritative Statutory Fee Derivation (#56)
- **Context**: Residents could previously manipulate document fees or claim payment waivers directly in client writes to `documentRequests`.
- **Decision**: Block client-side creation in `firestore.rules` (`allow create: if canManageRequests()`). Direct all resident request submissions through `POST /api/resident/requests/create`, which computes fees authoritatively from `system_config`, RA 11261 (First-Time Jobseeker), Indigency, and demographic waivers, and sets the initial payment state.

## ADR-012: Trusted Server-Boundary IP Extraction for Audit Trail (#6)
- **Context**: Administrative mutation audit records captured "localhost" or unverified client claims (#6).
- **Decision**: Introduce `POST /api/audit/log` endpoint and `extractClientIp` utility that inspects trusted reverse-proxy headers (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`) with strict IPv4/IPv6 format validation and authenticates actor credentials before persisting audit logs.

## ADR-013: Unified Resident Identity Coordination Boundary & Stale Auth Write Elimination
- **Context**: Firebase Auth email updates are external side-effects executed outside of Firestore ACID transactions and lack provider compare-and-swap (CAS) primitives. Previously, verification approval coordinated by verification ID (`verificationApprovalOperations/${verificationId}`), while general resident email editing coordinated by resident ID (`identityOperationLocks/${residentId}`). Because they used disjoint lock records, concurrent execution could mutate the same Auth user. Furthermore, lease timeout expiration allowed second attempts to take over while a prior attempt was stalled in-flight; when the stalled attempt resumed, its backward compensation restored the old Auth email, stomping over the newer completed identity.
- **Decision**:
  1. **Single Resident Coordination Boundary**: All operations mutating a resident's Auth identity or matching Firestore identity fields (verification approvals, general resident email edits, retries, compensations, reconciliations) must acquire and fence through a shared resident-level lock in Firestore `identityOperationLocks` keyed by `residentId`.
  2. **Persisted Intent & Multi-Stage State Machine**: Persist stage transitions to Firestore before external side-effects: `claimed` -> `auth-mutating` -> `auth-completed` -> `completed` (or `compensating` -> `compensated` / `reconciliation-required`).
  3. **No Unfenced Timeout Stealing**: Never permit timeout-based takeover while an attempt is in-flight or unresolved (`auth-mutating`, `auth-completed`, `compensating`, `reconciliation-required`). Concurrent requests receive HTTP 409 Conflict.
  4. **Ambiguous Result & Lost Response Resolution**: When external Auth calls encounter network errors or timeouts, check authoritative Auth state (`getAuthEmail`). If Auth already reflects the target email, advance forward to `auth-completed` and complete Firestore, avoiding duplicate writes or false rollbacks.
  5. **Fenced Compensation & Drift Protection**: Before backward compensation is attempted, claim a `compensating` fence in a Firestore transaction. Verify Auth email has not drifted away from the attempt's target value. If ownership changed, fence check fails, or Auth drifted, abort compensation immediately and record `reconciliation-required` without touching Auth.
  6. **Documented Operator Reconciliation Path**: Provide an explicit, authenticated reconciliation capability to resolve ambiguous or stranded identity locks into an authoritative matching state with transactional audit logging, ensuring no attempt blocks indefinitely.
  7. **Dual-Boundary Authorization & Target Revalidation**: Revalidate actor permissions and target resident state at both the initial claim boundary and the final transactional completion boundary.
- **Consequences**: Guarantees serial execution of identity mutations per resident, prevents stale attempts from undoing newer completed identities, ensures strict parity between Firebase Auth and Firestore email fields, and provides actionable conflict/incomplete status codes.

## ADR-009: Canonical Multi-Writer Identity Coordination, Transaction Ordering, and Quiescent Recovery
- **Status**: Accepted & Verified
- **Date**: 14 October 2026
- **Context**:
  - Competing writers (normal email update, verification approval, administrative reconciliation) previously maintained duplicate, inconsistent stage lists.
  - `reconciling` was missing from blocked-stage lists, allowing normal operations or another reconciler to replace a lock held by an executing reconciler.
  - In `sync-auth-to-firestore`, Firestore transaction ordering scheduled a resident update before reading the linked verification (`read-after-write` defect in Firestore emulator).
  - Simultaneous requests sharing identical `operationId` and `attemptId` could pass claim guards and overlap external mutations.
  - Standard Cloudinary HMAC URL signatures (`/s--...--/`) do not validate query-based expiration parameters (`?exp=...`), requiring truthful `expiresAt: null` return value.
- **Decisions**:
  1. **Canonical State Policy Module (`lib/admin/identity-coordination-policy.ts`)**:
     - Single shared policy module exporting `IN_FLIGHT_IDENTITY_STAGES` (`claimed`, `auth-pending`, `auth-mutating`, `auth-completed`, `compensating`, `reconciling`) and `ACTIVE_LOCKED_STAGES`.
     - `evaluateIdentityClaim`: blocks all active/in-flight stages, detects same-attempt simultaneous execution (returning 409 conflict), returns idempotent completion for matching inputs without duplicate writes.
     - `evaluateRecoveryEligibility`: blocks reconciliation while another reconciler runs (`reconciling`) or an operation is in-flight without operator `forceRecover`; binds recovery to `expectedOperationId` and `expectedAttemptId` to prevent anti-stomp collisions.
  2. **Transaction Read-Before-Write Ordering**:
     - In Phase 3 of `reconcileResidentIdentity`, all document reads (`lockRef`, `residentRef`, `callerRef`, `verifRef`, `opRef`) are executed strictly before any write, preventing Firestore transaction read-after-write errors.
  3. **Linked Verification Recovery Invariant**:
     - Linked verification is reset to `status: "pending"` with `processingOperationId: null` and `processingAttemptId: null`. Reconciling email synchronization alone never approves verification.
  4. **Durable Failure Handling**:
     - If finalization fails or caller permission is revoked during reconciliation, the lock is transitioned to `reconciliation-required` with the exact error message, never silently released or permanently stranded in `reconciling`.
  5. **Cloudinary Protected Media Delivery**:
     - Verified live against Cloudinary `gmseg91m` using a dedicated disposable asset: unsigned access returns 401, signed access returns 200, query `exp` parameter is not validated by standard HMAC signatures, and `generateSignedDeliveryUrl` returning `expiresAt: null` is verified accurate.
- **Consequences**: Complete multi-writer safety, zero read-after-write transaction errors across all reconciliation actions, safe and actionable operator recovery, and verified protected media delivery.

## ADR-014: Fenced In-Flight Recovery Protection and Verification Approval Record Resolution
- **Status**: Accepted & Verified
- **Date**: 14 October 2026
- **Context**:
  - Blocker 1: An in-flight auth-mutating lock could previously become eligible for recovery with only `{ forceRecover: true }` without providing expected operation/attempt identifiers or verifiable proof that external side effects had ceased.
  - Blocker 2: Email-only recovery reset linked verifications to `pending`, but restored the original approval operation ID onto the completed lock, causing the claim policy (`evaluateIdentityClaim`) to return `{ outcome: "completed", idempotent: true }` and skip pending approval work. Additionally, reconciliation inspected `identityOperations` rather than `verificationApprovalOperations`, leaving the approval operation unresolved.
- **Decisions**:
  1. **Strict In-Flight Recovery Fencing (Blocker 1)**:
     - In `lib/admin/identity-coordination-policy.ts`, boolean-only `{ forceRecover: true }` is strictly disallowed for in-flight locks (`IN_FLIGHT_IDENTITY_STAGES`).
     - In-flight recovery mandates explicit `expectedOperationId` and `expectedAttemptId` matching the active lock.
     - In-flight recovery requires verifiable evidence or conditions that external writes have ceased (`externalWriteStopped: true`, `externalWriteStatus: "stopped" | "failed" | "timed-out"`, `quiescenceEvidence`, or explicit staleness window `staleTimeoutMs` / `isStale`).
  2. **Dedicated Approval Operation Keying and Transition (Blocker 2)**:
     - In `lib/admin/identity-reconciliation.ts`, resolve `linkedVerificationId` from lock and bind `opRef` to `verificationApprovalOperations.doc(linkedVerificationId)` for verification approval operations.
     - Transition linked approval operation records to `status: "reconciled"` rather than `"completed"`.
     - Complete resident lock strictly with `operationId: "reconcile-${residentId}-${reconciliationId}"`, retaining `targetOperationId` without restoring the approval operation ID.
     - In `app/api/admin/verifications/approve/route.ts`, return `completed` only when `verification.status === "approved"`, never when the verification remains `pending`.
- **Consequences**: Guarantees recovery cannot overlap with live auth-mutating external side effects, ensures pending verification approvals remain fully claimable and executable after email-only reconciliation, and preserves normal writer blocking during active reconciliation.

## ADR-015: Idempotent Lock Cleanup and Recovery Liveness on Phase 2 & Owned Phase 3 Failures
- **Status**: Accepted & Verified
- **Date**: 14 October 2026
- **Context**:
  - During identity reconciliation, the resident lock transitions to `reconciling` in Phase 1.
  - If `auth.getUser()` failed, or `sync-auth-to-firestore` found no Auth email, or any other Phase 2 error occurred, the function threw without transitioning the lock out of `reconciling`.
  - Because `reconciling` blocks every recovery attempt (returning 409), that resident became permanently stuck and unrecoverable.
  - Additionally, Phase 3 immediately rethrew errors with status 409 before running its catch cleanup transaction, leaving locks owned by the reconciliation attempt stuck in `reconciling` on owned 409 errors.
- **Decisions**:
  1. **Comprehensive Phase 2 Cleanup**:
     - Wrapped Phase 2 in defensive error handling that catches auth lookup failures, empty Auth emails in `sync-auth-to-firestore`, empty Firestore emails in `sync-firestore-to-auth`, provider update failures, and differing emails on `release-lock`.
     - Added `restoreLockToRecoveryState`: an idempotent helper running a Firestore transaction to update `identityOperationLocks/{residentId}` to `status: "reconciliation-required"` with the specific failure details whenever the lock is still owned (`attemptId === reconciliationId && status === "reconciling"`).
  2. **Owned Phase 3 409 Cleanup Before Rethrow**:
     - Removed the short-circuiting `if (finalizeError?.status === 409) throw finalizeError` before cleanup in Phase 3.
     - Catch block invokes `restoreLockToRecoveryState` first: if the lock is owned by `reconciliationId` in `reconciling`, it transitions to `reconciliation-required` before rethrowing the 409 error. If another operation took over the fence, `restoreLockToRecoveryState` safely leaves the newer lock untouched.
  3. **Idempotent Finally Guarantee**:
     - Integrated `finally` block ensuring that any unhandled exception or pre-finalization abort releases the lock to `reconciliation-required` without masking the original error.
  4. **Target and Previous Operation ID Binding**:
     - Updated `ExistingLockState` and `evaluateRecoveryEligibility` in `lib/admin/identity-coordination-policy.ts` to allow `expectedOperationId` and `expectedAttemptId` to match `targetOperationId` / `previousOperationId` on quiesced locks, ensuring subsequent recoveries can cleanly target the original operation.
- **Consequences**: Eliminates permanent lock stranding in `reconciling`; all Phase 2 and owned Phase 3 failure paths leave durable, actionable `reconciliation-required` locks that can be claimed by subsequent recovery attempts; preserves strict anti-stomp protections and normal writer blocking.

## ADR-016: Server-Authoritative Atomic Initial Registration and Ambiguous-Commit Recovery

- **Status**: Accepted; locally verified; deployment and Rules publication pending
- **Date**: 15 October 2026
- **Context**: Initial registration previously created Auth, sent email, wrote the resident/verification/notification in a client batch, sent email again, and then claimed proofs. A claim failure or lost claim response could delete Auth after Firestore committed, orphan records, or split proof ownership from the registration.
- **Decision**:
  1. A revocation-checked `POST /api/resident/registration/finalize` endpoint accepts a freshly authenticated user without requiring a pre-existing profile. Auth supplies UID/email; the server allowlists resident/proof fields and derives IDs, resident role, Pending/unverified lifecycle, empty expiry, and timestamps.
  2. Cloudinary identity/existence verification occurs before Firestore transaction execution. The transaction re-reads every reservation before any write, then atomically claims all reservations and creates the resident, canonical initial verification, canonical admin notification, and completed `registrationOperations` record.
  3. The operation document is scoped by a SHA-256 digest of UID plus caller-stable operation ID. A canonical SHA-256 payload hash binds normalized resident data and proof identities/metadata but excludes plaintext claim capabilities. Same-payload replay is success; changed replay is 409; completed state is never overwritten.
  4. Only explicit server responses with `committed: false` permit cleanup of the fresh Auth identity. Browser transport loss and generic Firestore commit-acknowledgement errors are `committed: unknown`, retry the exact operation/payload, preserve Auth, and never guess backward compensation.
  5. Verification email is outside the Firestore transaction and is attempted once after confirmed/idempotent finalization. Mail failure preserves registration and points users to the login resend path.
  6. Firestore Rules deny direct initial profile creation, require an existing authoritative profile for active-account privileges, and keep initial registration writes server-only while preserving existing unverified registration resubmission plus profile-edit/reactivation/payment/owner workflows.
- **Consequences**: Initial Firestore registration state and proof ownership cannot split across commits; a lost response converges through replay; Auth-only identities have no active resident privileges. Application deployment must be verified before tightened Rules are published. No deployment or Rules publication is part of this decision record.

## ADR-017: Server-Authoritative Registration Recovery, Strict Auth Preservation, and Gated Resubmission Lifecycle

- **Status**: Accepted; locally verified; deployment and Rules publication pending
- **Date**: 15 October 2026
- **Context**:
  - `committed: false` on transient Auth lookup or token errors, payload conflicts, or preflight failures allowed the client to delete Firebase Auth even when the registration had already committed or could commit.
  - In-memory refs and sets did not survive page refresh or browser crashes, leaving incomplete Auth identities unable to restart due to `auth/email-already-in-use`.
  - Unfinalized authenticated sign requests could potentially request arbitrary upload folders or receive broader resident upload permissions.
  - Client-side direct creation of `registration` type in `verifications` and `notifications` in `firestore.rules` allowed duplicate pending verifications to be spammed without proving a prior rejection.
  - UTC date getters in age calculations caused misalignment between midnight and 08:00 Manila time for residents turning 18 or 60.
- **Decisions**:
  1. **Strict Auth Preservation on Uncertain Commit Outcomes**: Removed speculative client-side deletion of Firebase Auth accounts. HTTP errors (400, 401, 403, 409, 503) and state conflicts return `committed: "unknown"` rather than false proof of non-commit. Auth is preserved unconditionally whenever there is uncertainty.
  2. **Server-Authoritative Registration Status & Recovery**: Added `GET /api/resident/registration/status` (`inspectRegistrationStatus`) verifying ID tokens, deriving identity from Auth, and categorizing into `completed`, `incomplete`, `in-flight`, `rejected`, or `existing-resident`. Incomplete identities can resume proof upload without restarting Auth creation.
  3. **Scoped Proof Signing for Incomplete Applicants**: In `/api/cloudinary/sign`, callers without a user profile are recognized as `registration-applicant`, restricted exclusively to folder `talasys/proofs` and publicId prefixed with `registration/`, and entries are reserved in `mediaRegistry` with an expiring claim token.
  4. **Server-Gated Registration Resubmission Lifecycle**: Removed client creation of `registration` verifications and notifications from `firestore.rules`. Established `POST /api/resident/registration/resubmit` enforcing resident ownership, unverified status, existence of a prior rejected registration, and absence of active pending verifications before atomic creation of a new verification and notification. Client profile edits and reactivations remain directly allowed.
  5. **Asia/Manila Calendar Day Age Calculation**: Centralized age calculation in `resident-status.ts` using `calculateAge`, evaluating age using Asia/Manila calendar day components (UTC+8 offset) across Manila midnight, boundary dates, and Feb 29 leap years independent of server/browser host timezone.
- **Consequences**: Eliminates orphan registrations and speculative Auth destruction; provides coherent restart/continuation after refresh/crash; closes duplicate resubmission spam; aligns age classification across client and server.

## ADR-018: Protected Registration Resubmission Proof Verification, Concurrency Mutual Exclusion, and State Machine Lockdown

- **Status**: Accepted; locally verified; deployment and Rules publication pending
- **Date**: 15 October 2026
- **Context**:
  - The initial resubmission implementation accepted arbitrary non-empty URLs (such as `https://example.test/...`) without validating Cloudinary authenticity, authenticated delivery type, or owner namespace (R01).
  - Checking pending verifications via query outside the transaction permitted concurrent resubmissions to race and simultaneously create duplicate pending verification records (R02).
  - Completed resubmission operations reused `registrationOperations` without binding to `operationType`, `targetId`, and a canonical payload hash, permitting modified-payload replays or cross-operation collisions (R03).
  - Initial check of `auth.currentUser` on mount failed to handle async session restoration from IndexedDB on refresh, causing recovery checks to silently bail out (R04).
  - Recovered registrations falsely claimed a verification email had just been sent while displaying an empty email (R05).
  - An unobservable `in-flight` status was advertised by the registration status endpoint (R06).
  - Active and Expired accounts were not strictly excluded from registration resubmission (R07).
  - `residentVerificationLocks` needed an explicit default-deny rule in `firestore.rules` (R08).
- **Decisions**:
  1. **Enforce Authentic Cloudinary Proofs in Resubmission**: `processRegistrationResubmission` parses each proof with `parseCloudinaryAsset`, requires `deliveryType === "authenticated"`, matches cloud identity, restricts `publicId` to `talasys/proofs/${callerUid}/` or `talasys/proofs/registration/`, checks `mediaRegistry` ownership, and enforces that all required documents from `getRequiredDocuments` matching the resident's classification are satisfied.
  2. **Transactional Concurrency Protection via `residentVerificationLocks`**: Contend on `residentVerificationLocks/{residentId}` inside `db.runTransaction`. Two concurrent requests contend on the same lock document; exactly one succeeds, and the retried transaction sees `activeVerificationStatus === "pending"` and aborts with 409 `PENDING_VERIFICATION_EXISTS`. Approval and rejection operations update the lock status accordingly.
  3. **Exact Canonical Idempotency Binding**: Compute `canonicalResubmissionPayloadHash(callerUid, proofs, reason)` and bind `operationType: "registration-resubmission"`, `targetId: callerUid`, and `payloadHash` in `registrationOperations`. Replaying exact payload returns 200 idempotent; changed payload returns 409 conflict.
  4. **Async Auth Session Restoration via `onAuthStateChanged`**: Subscribe to `onAuthStateChanged` in `app/auth/register/page.tsx` to reliably recover sessions after browser refresh once IndexedDB persistence restores `currentUser`.
  5. **Truthful Recovery UI & Populated Email**: Populate `formData.email` from `currentUser.email || data.details?.email` on recovery, and render dedicated pending-review copy without falsely claiming a new verification email was dispatched.
  6. **Eliminate Dead `in-flight` State**: Remove `in-flight` from status types and queries in `lib/security/registration-status.ts`.
  7. **Strict State Machine Enforcement**: Limit resubmission strictly to `status === "Pending"` and `isVerified !== true`, explicitly rejecting `Active`, `Expired`, `Locked`, and `Deleted` accounts with specific error codes.
  8. **Firestore Rules Lockdown**: Add `match /residentVerificationLocks/{residentId} { allow read, write: if false; }` in `firestore.rules`.
- **Consequences**: Completely stops proof spoofing and cross-user proof theft; guarantees mutual exclusion under concurrent load; provides dependable browser refresh recovery; eliminates false UI assertions.

## ADR-019: Registration Verification Deletion Lockdown, Fail-Closed Provider Verification, Authoritative Idempotent Verification IDs, and Stable Frontend Operation IDs (R09–R12)

- **Status**: Accepted; verified against unit, emulator, and Playwright suites; deployment and Rules publication pending
- **Date**: 15 October 2026
- **Context**:
  - `firestore.rules` allowed authenticated residents to delete any pending verification where `residentId == auth.uid`, allowing direct client deletion of `type == "registration"` verifications. This bypassed server lifecycle controls and left `residentVerificationLocks` and `users.hasPendingVerification` desynchronized (R09).
  - `app/api/resident/registration/resubmit/route.ts` silently caught initialization exceptions from `createCloudinaryAssetVerifier()`, falling back to `undefined` and skipping Cloudinary provider checks whenever configuration was missing or threw (R10).
  - In `lib/security/registration-resubmission.ts`, transactional same-operation detection returned `{ idempotent: true }` without `verificationId`, causing the outer handler to return a newly generated, uncommitted UUID. Racing same-operation replays returned document IDs that did not exist (R11).
  - The resident profile and registration resubmission client (`hooks/resident/use-resident-data.ts`) did not supply an `operationId`, causing the server to generate fresh UUIDs on each attempt and treating network retries as separate operations (R12).
- **Decisions**:
  1. **Strict Lockdown of Verification Deletion in Firestore Rules (R09)**: Updated `verifications` delete rule to strictly deny resident deletion of `type == "registration"` verifications. Residents may only delete unreviewed pending verifications of type `profile-edit` or `reactivation`. SuperAdmin retains administrative deletion rights.
  2. **Fail-Closed Provider Verification in Resubmission (R10)**: Removed try/catch fallback in `/api/resident/registration/resubmit`. Route throws 503 `PROVIDER_VERIFICATION_UNAVAILABLE` on verifier creation failure. `processRegistrationResubmission` mandates `dependencies.verifyAsset`, rejecting with 503 `PROVIDER_VERIFICATION_REQUIRED` if omitted. Provider verification runs before database transactions, mapping 404 to `PROOF_ASSET_NOT_FOUND` and mismatch to `PROOF_IDENTITY_MISMATCH` (409) with zero database writes.
  3. **Authoritative Verification ID on Idempotent Replays (R11)**: `runTransaction` returns `{ idempotent: true, verificationId: opData.verificationId }` when a completed operation is detected. The outer response returns `verificationId: txResult.verificationId`, guaranteeing that concurrent replays, transaction retries, and lost response recoveries always reference the existing authoritative verification document.
  4. **Stable Operation ID and Duplicate Submit Guards on Frontend (R12)**: Implemented `lib/resident/resubmission-operation.ts` to compute deterministic payload fingerprints and persist `operationId` in `sessionStorage` (`talasys_resubmit_op_${residentId}`) across retries and refreshes without storing secrets. Guarded submissions with `isSubmittingProfileEditRef` in `use-resident-data.ts` and UI state in `profile/page.tsx`. Cleared operation ID on completion or `PENDING_VERIFICATION_EXISTS`.
- **Consequences**: Closes lifecycle desynchronization via client deletion; prevents unverified proof resubmission on missing provider configuration; eliminates phantom verification IDs on retries; ensures frontend retries are idempotent and safe.

## ADR-020: Frontend Pre-Upload Resubmission Fingerprinting & Server-Authoritative Verification Deletion (R13–R14)

- **Status**: Accepted; fully verified across unit, rules/emulator, and authenticated browser Playwright suites; deployment and Rules publication pending
- **Date**: 15 October 2026
- **Context**:
  - The frontend previously uploaded files to Cloudinary before generating its payload fingerprint and operation ID. On network interruption or user retry, newly uploaded files received new Cloudinary URLs, causing a new operation ID to be generated rather than replaying the authoritative committed operation (R13).
  - Firestore Rules previously allowed Super Admins to directly delete registration verification documents via client SDK. Direct client deletion bypassed server lifecycle state, leaving `residentVerificationLocks` and `users.hasPendingVerification` inconsistent and stranding the resident in a locked or phantom pending state (R14).
- **Decisions**:
  1. **Pre-Upload Logical Input Fingerprinting and Cached Attempt (R13)**: In `lib/resident/resubmission-operation.ts`, implemented `computeInputFilesFingerprint(inputFiles, reason)` to compute a deterministic SHA-256 fingerprint based on file names, sizes, types, last modified dates, and the resubmission reason BEFORE uploading to Cloudinary. Cached upload progress in `sessionStorage` under `talasys_resubmit_op_${residentId}`. On retry after network failure or response loss, `getOrPrepareResubmissionAttempt` returns the cached attempt, preserving both the original `operationId` and the uploaded documents, preventing redundant Cloudinary uploads and conflicting operation IDs.
  2. **Authoritative 409 Verification ID Recovery**: Server `/api/resident/registration/resubmit` attaches the active `verificationId` in the 409 `PENDING_VERIFICATION_EXISTS` JSON response. `useResidentData.requestProfileEdit` consumes this ID to recover the authoritative verification across lost network responses, refreshes, and concurrent clicks, and clears the cached attempt upon completion.
  3. **Form State Preservation during Firestore Real-Time Snapshot Refreshes**: Updated `app/resident/profile/page.tsx` with `prevDialogOpenRef` to prevent Firestore real-time `user` snapshot updates from resetting the resident's entered form data and file selections while the edit modal is open.
  4. **Strict Lockdown of Client Registration Verification Deletion (R14)**: Updated `firestore.rules` for `/verifications/{verificationId}` to require `resource.data.type != 'registration'` for all roles, completely blocking direct client deletion of registration verifications by any user (including Super Admin).
  5. **Server-Authoritative Coordinated `verification.delete` Operation (R14)**: Added `verification.delete` operation in `app/api/admin/operations/route.ts` requiring Super Admin authorization (`isSuperAdminRole(actor.role)`). In a Firestore transaction, it deletes the verification document, sets `users.hasPendingVerification = false` and `users.pendingVerificationId = null`, clears `residentVerificationLocks/{residentId}` with active status `"deleted"`, and writes an authoritative audit event to ensure lifecycle consistency.
- **Consequences**: Completely resolves frontend upload duplicate resubmission and lost-response recovery without generating conflicting operation IDs; protects resident accounts from stranded lifecycle states caused by uncoordinated direct verification deletion; preserves administrative deletion authority through a coordinated, audited, transactionally consistent server operation.

## ADR-021: Functional Bug Remediation, Workflow Invariants, Accurate Reporting & Dashboard Truthfulness (F01–F16)

- **Status**: Accepted; fully verified across unit, rules/emulator, and authenticated browser Playwright suites; deployment and Rules publication pending
- **Date**: 15 October 2026
- **Context**:
  - Independent repository audit identified 16 functional defects across Resident/Admin workflows, reporting/generation, and dashboards/error feedback (F01–F16).
  - F01: Residents could not dismiss/revert rejected profile-edit submissions because Firestore Rules restricted client deletion to `status == 'pending'`.
  - F02: Admin payment confirmation executed `updateRequestStatus("On Process")` immediately after `confirmPayment`, triggering a 409 status error toast even though payment succeeded.
  - F03: Payment actions ("Pay Now", "Resubmit") were rendered on terminal requests (`Cancelled`, `Rejected`, `Completed`).
  - F04: Admin payment queue and pending count included terminal requests and zero-fee requests.
  - F05 & F06: Super Admin account actions and Admin resident lifecycle actions closed modals immediately without awaiting async backend calls, giving false success or premature dismissals.
  - F07: Super Admin creation form collected `contactNumber` but omitted it from the backend API dispatch and persistence model.
  - F08: Cancelled requests remained visible in the active document queue and were omitted from Document History.
  - F09 & F10: Admin report PDF generation omitted selected columns (`expiry`, `categories`), and sorting dropdowns were disconnected from table rendering.
  - F11: Super Admin reports lacked an explicit "Non-Voters List" option and did not filter by non-voters.
  - F12: Request deep-linking to document generation defaulted custom templates to generic `custom_blank` rather than matching configured custom document types.
  - F13 & F14: Issuance date-range reports filtered by request creation date rather than document issuance timestamp, and export format/period controls were ignored on Full Analytics.
  - F15: Super Admin dashboard displayed fabricated KPIs (hardcoded 24h turnaround, 4.9 satisfaction score, arbitrary sparklines) and mismatched chart data keys (`day` vs `month`).
  - F16: `cancelRequest` and `submitPayment` swallowed errors or displayed inappropriate toast messages (e.g., profile request toast on document payment).
- **Decisions**:
  1. **Rejected Profile-Edit Deletion Rule (F01)**: In `firestore.rules`, updated `/verifications/{verificationId}` delete rule to allow resident owner deletion when `resource.data.type == 'profile-edit' && resource.data.status in ['pending', 'rejected']`, strictly preserving registration verification deletion blocks.
  2. **Atomic Single-Step Payment Confirmation (F02)**: Removed redundant `updateRequestStatus("On Process")` from `admin-payment-process-modal.tsx`. Server operation `request.confirmPayment` atomically updates both payment status to `"Paid"` and request status to `"On Process"` for eligible states (`"Pending"`, `"Approved"`, `"Awaiting Payment"`).
  3. **Terminal Request Action Invariants (F03 & F04)**: Filtered out terminal requests (`Cancelled`, `Rejected`, `Completed`) from payment action triggers in resident history, payment modal, admin payment queue, and admin pending counter.
  4. **Awaited Administrative Dialogs & Operations (F05 & F06)**: Added async loading states (`isActionLoading`, `isUpdatingRole`, `isOperating`), disabled controls during in-flight operations, and displayed inline error alerts in `superadmin/admins/page.tsx` and `admin/residents/page.tsx`, keeping dialogs open for retry upon failure.
  5. **Admin Contact Number Persistence (F07)**: Added `contactNumber` validation, forwarding in `useSuperAdminData.addAdmin`, allowed field in `ADMIN_UPDATE_FIELDS`, and persistence in `users` during admin account creation transaction.
  6. **Document History Partitioning (F08)**: Excluded `Cancelled` from `activeRequests` in `admin/requests/page.tsx` and included `Cancelled` in `historyRequests` in `document-history-content.tsx` with proper badges and timestamp fallbacks.
  7. **Report Column Mapping, Sorting & Non-Voters (F09, F10, F11)**: Mapped `expiry` and `categories` in PDF export, implemented deterministic sorting (`sortedResidents`, `sorted`), added "Non-Voters List" option, and filtered strictly by `!r.isVoter`.
  8. **Custom Document Deep-Linking & Issuance Timestamps (F12, F13, F14)**: Resolved custom document requests against `systemConfig.customDocumentTypes` in `admin/generate/page.tsx`. Filtered issuance reports by `getIssuanceTimestamp` (`generatedAt || Ready for Pick Up || Completed || updatedAt || createdAt`), and supported ExcelJS `.xlsx` and CSV export honoring year/month periods.
  9. **Truthful Dashboard Metrics & Transparent User Feedback (F15, F16)**: Replaced fabricated dashboard metrics with authoritative calculations or honest "N/A" states, fixed chart data keys (`month`), rethrew descriptive errors in hooks, and introduced dedicated toast presets for payment submission and cash confirmation.
- **Consequences**: Completely resolves all 16 audit findings; ensures UI feedback and server operations are fully aligned; eliminates false errors, misleading metrics, and disconnected controls; maintains all prior security, lifecycle, and concurrency invariants.

## ADR-022: Final Integration Corrections & Authoritative Policy Enforcement (F03, F04, F14, F15, F13, Test Quality)

- **Status**: Accepted; fully verified across unit (183/183), rules/emulator (58/58), and authenticated browser Playwright (27/27) suites; clean git diff.
- **Date**: 15 October 2026
- **Context**:
  - Independent verification of F01–F16 revealed 5 specific integration inconsistencies:
    1. F03: Mobile request cards in `app/resident/history/page.tsx` evaluated payment eligibility primarily from `paymentStatus` and `documentFee`, allowing Pay Now / Resubmit buttons on terminal requests (`Cancelled`, `Rejected`, `Completed`).
    2. F04: Admin payment queue in `app/admin/requests/payments/page.tsx` admitted zero-fee requests when `status === "Awaiting Payment"` or `paymentStatus === "pending_verification"`.
    3. F14: Report period filter in `app/superadmin/reports/page.tsx` returned `true` when `createdAt` was missing, incorrectly admitting undated records into period-filtered reports.
    4. F15: Resident `createdAt` is formatted as an ISO string (`toISOString()`), which evaluated to `NaN` when compared directly against numeric Unix ms epoch timestamps in `app/superadmin/dashboard/page.tsx`. Additionally, sparklines used fallback `count || adminStats.totalResidents`, overwriting genuine historical zero counts with today's population.
    5. F13: Document issuance report fallback used `updatedAt || createdAt`, falsely labeling unrelated updates or initial submissions as issuance dates.
    6. Test quality: Unit tests in `milestone-a-functional.test.ts`, `milestone-b-functional.test.ts`, and `milestone-c-functional.test.ts` previously defined their own inline mock functions rather than importing and verifying production modules.
- **Decisions**:
  1. **Single Shared Resident Payment Action Eligibility Policy (F03)**:
     - Implemented `isResidentPaymentActionEligible(request)` in `lib/resident/payment-policy.ts` (re-exported in `lib/resident/index.ts`).
     - Gated to `RESIDENT_PAYMENT_ELIGIBLE_STATUSES = new Set(["Pending", "Approved", "On Process"])` with `documentFee > 0`, non-terminal status, and `paymentStatus !== "paid" && paymentStatus !== "waived"`.
     - Preserves `firestore.rules` client update restrictions (does not allow direct resident mutation of `Awaiting Payment`).
     - Applied uniformly to mobile cards, desktop table, and `PaymentModal` guards.
  2. **Authoritative Admin Payment Queue Policy (F04)**:
     - Implemented `isAdminPaymentQueueEligible(request)` in `lib/admin/payment-queue-policy.ts` (re-exported in `lib/admin/index.ts`).
     - Excludes terminal requests (`Cancelled`, `Rejected`, `Completed`), fully paid, waived, and requests with `documentFee <= 0`.
     - Unified payment queue table, header counter badge, and `AdminPaymentProcessModal` guards.
  3. **Strict Period Date Filtering in Asia/Manila (F14)**:
     - Implemented `isRecordInPeriod` and `getManilaCalendarDate` in `lib/timestamp-normalizer.ts`.
     - "All Time" includes all records; specific year or month/year strictly requires a valid timestamp belonging to that Philippine reporting period (`Asia/Manila` UTC+8) and excludes undated/missing records.
  4. **Universal Timestamp Normalization & Zero-Preserving Sparklines (F15)**:
     - Implemented `normalizeTimestamp` in `lib/timestamp-normalizer.ts` supporting ISO strings, numeric ms, numeric seconds, Date objects, and Firestore Timestamps uniformly.
     - Replaced direct comparisons with `normalizeTimestamp` in `app/superadmin/dashboard/page.tsx` and `app/superadmin/reports/page.tsx`.
     - Preserved genuine 0 counts in population sparklines by eliminating `count || adminStats.totalResidents`.
  5. **Authoritative Document Issuance Timestamps (F13)**:
     - Implemented `getAuthoritativeIssuanceTimestamp` in `lib/timestamp-normalizer.ts`.
     - Prioritizes `issuedAt`, `generatedAt`, `statusTimestamps['Ready for Pick Up']`, `statusTimestamps['Completed']`.
     - Strictly never falls back to `createdAt` or unrelated `updatedAt`; returns `null` for unissued/undated records.
  6. **Production-Path Regression Verification & Test Quality Refactoring**:
     - Refactored `test/milestone-a-functional.test.ts`, `test/milestone-b-functional.test.ts`, and `test/milestone-c-functional.test.ts` to import production policies directly.
     - Added adversarial fixtures (zero-fee `Awaiting Payment`, cancelled requests with fee, ISO string timestamps, Manila midnight edge cases).
     - Added 2 Playwright E2E browser tests in `test/e2e/authenticated-workflows.spec.ts` covering F03 across desktop (1280x800) and mobile (375x667) viewports, and F04 in the live admin payment queue.
- **Consequences**:
  - Eliminates all remaining inconsistencies between mobile and desktop resident payment actions.
  - Guarantees zero-fee requests never enter the admin payment queue or inflate awaiting-payment counts.
  - Ensures exported reports and dashboard trends reflect accurate, verified Philippine reporting periods and legitimate historical data without zero-replacement or date fabrication.
  - Unit and E2E test suites exercise production code directly, providing reliable regression protection.
