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

## ADR-023: Final Functional Corrections — Payment Modal Live-State Consistency (F17) & Full Analytics Generation-Period Accuracy (F18)

- **Status**: Accepted; verified across unit tests (198/198), rules/emulator suite (58/58), and authenticated browser Playwright suite; clean git diff.
- **Date**: 16 October 2026
- **Context**:
  - Independent verification of TALASYS discovered two targeted defects before final acceptance readiness:
    1. **F17 (Resident payment modal displays stale request/payment state)**:
       - In `app/resident/history/page.tsx`, `paymentRequest` was stored as a component state snapshot rather than derived from the existing live `requests` Firestore subscription (`onSnapshot`).
       - When passing the request to `PaymentModal`, `paymentStatus` was omitted from the candidate object.
       - In `lib/resident/payment-policy.ts`, `request.paymentStatus || "unpaid"` defaulted an absent payment status to `"unpaid"`, incorrectly authorizing paid or waived requests.
       - When requests became paid, cancelled, rejected, or were deleted while the modal was open, the modal failed to react or closed silently without an explanation.
    2. **F18 (Full Analytics attributes generated documents to submission period)**:
       - In `app/superadmin/reports/page.tsx`, `Full Analytics` filtered requests by `createdAt` (submission period) and then counted those with `hasGenerated === true`.
       - Requests submitted in earlier months (e.g., January) and generated in later months (e.g., March) were erroneously counted in January and omitted from March.
       - Historical records with `hasGenerated === true` but lacking `generatedAt` required honest preservation without date fabrication.
- **Decisions**:
  1. **Strict Payment Status Invariant & Live Subscription Derivation (F17)**:
     - In `lib/resident/payment-policy.ts`, updated `isResidentPaymentActionEligible` to strictly require valid payment status (`"unpaid"` or `"pending_verification"`). Never defaults an omitted or unknown payment status to `"unpaid"` unless explicitly identified as a legacy record (`isLegacyRecord: true`).
     - In `app/resident/history/page.tsx`, replaced `paymentRequest` snapshot state with `paymentRequestId`, reactively deriving `activePaymentRequest` from the active real-time `requests` subscription. Supplies the full authoritative request object to `PaymentModal`.
     - In `components/resident/history/payment-modal.tsx`, rendered a graceful "Request Unavailable" dialog if the request is deleted or no longer accessible while open; computed specific truthful ineligibility reasons (paid, waived, cancelled, rejected, completed, ready for pick up, zero-fee, unverified); strictly disabled submit buttons and guarded both GCash and Cash submissions against ineligible execution.
  2. **Authoritative Generation Timestamp Resolution & Report Metrics Isolation (F18)**:
     - In `lib/timestamp-normalizer.ts`, implemented `getAuthoritativeGenerationTimestamp` inspecting `generatedAt` (written atomically by `request.markGenerated`) and explicit lifecycle generation timestamps, strictly never falling back to `createdAt` or generic `updatedAt`.
     - Implemented `getAuthoritativeRejectionTimestamp` inspecting `rejectedAt` and `statusTimestamps['Rejected']`.
     - Implemented shared production helper `calculateFullAnalyticsMetrics` partitioning metrics:
       - `Total Requests Submitted`: aggregated strictly by `createdAt` (submission cohort).
       - `Documents Generated`: aggregated strictly by authoritative `generatedAt` (generation event period). Historical records lacking generation timestamps are strictly excluded from period-specific reports and counted in All Time with transparent unknown-date breakdown.
       - `Rejected Requests`: aggregated strictly by authoritative rejection event timestamp.
       - Output-format parity: single `rows` calculation shared identically across Excel (`.xlsx`), CSV, and PDF exports.
     - In `app/superadmin/reports/page.tsx`, wired `calculateFullAnalyticsMetrics` to `Full Analytics` and updated `reportGenerationTrend` to resolve generation via `getAuthoritativeGenerationTimestamp`.
- **Consequences**:
  - Eliminates stale payment actions: paid, waived, cancelled, or deleted requests instantly disable modal submission with accurate explanatory feedback.
  - Guarantees administrative reports and analytics truthfully reflect actual document generation events rather than submission dates.
  - Ensures complete output parity across PDF, CSV, and XLSX exports without database migration or date fabrication.

## ADR-024: Permanent Registration Denial, Safe Soft Deletion, and Lifecycle Consistency

- **Status**: Proposed / In-Progress
- **Date**: 16 October 2026
- **Context**:
  - Previously, Super Admin deletion of an initial pending registration verification (`verification.delete`) cleared the resident's pending verification references while leaving their account in `status = "Pending"`.
  - Because registration resubmission (`POST /api/resident/registration/resubmit`) strictly requires a prior `rejected` initial registration verification, deleting the verification record orphaned the resident account in `Pending` without a valid resubmission or correction path.
  - The system lacked a first-class, server-authoritative **Deny Registration** workflow for initial resident registrations that should be permanently refused.
  - Physical deletion of the resident's Firebase Auth identity, Firestore user document, or verification history would destroy audit trails and evidence.
  - Generic account activation (`resident.activate`) could also inadvertently reactivate a denied resident if lifecycle guards were missing.
- **Decisions**:
  1. **Two Distinct Registration Decisions**:
     - **Reject Registration (Correctable)**: Return the application for document corrections (`verification.reject`). The verification becomes `rejected`, resident account remains `Pending`, and the resident retains access to the registration-resubmission path.
     - **Deny Registration (Permanent)**: Permanently deny the registration (`verification.denyRegistration`). The verification becomes `denied`, resident account transitions to `Deleted` (safe soft deletion, preserving Auth UID, email, name, registration history, and uploaded documents), coordination locks are finalized, and the resident cannot sign in, resubmit, or access services.
  2. **Dedicated Server-Authoritative Denial Route (`verification.denyRegistration`)**:
     - Requires active Super Admin authorization (`isSuperAdminRole(actor.role)`).
     - Authoritatively validates Firestore state: target verification must exist, be of type `registration`, and have status `pending`; target resident must exist, have role `resident`, be unverified (`isVerified !== true`), and have status `Pending`.
     - Fences active operations: verifies no active approval or competing verification operation owns the resident's locks.
     - Runs atomically in a Firestore transaction:
       - `users/{residentId}`: set `status = "Deleted"`, `registrationDenied = true`, `deniedAt`, `denialReason`, `deniedBy`, `deniedByUid`, clear `hasPendingVerification` and `pendingVerificationId`.
       - `verifications/{targetId}`: set `status = "denied"`, `denialReason`, `deniedAt`, `deniedBy`, `deniedByUid`, `updatedAt`.
       - `residentVerificationLocks/{residentId}`: set `activeVerificationId = targetId`, `activeVerificationStatus = "denied"`, `denialReason`, `deniedAt`, `updatedAt`.
       - `notifications`: dispatch authoritative denial notification.
       - `activityLogs`: record authoritative audit event with actor, action, previous/new lifecycle states, and denial reason.
  3. **Prevent Orphaned-Pending Deletion & Accidental Reactivation**:
     - `verification.delete`: Explicitly reject generic deletion of pending initial registration verifications (preventing stranding a first-time applicant in `Pending` without a verification record).
     - `resident.activate`: Explicitly reject activation attempts on permanently denied residents (`registrationDenied === true` or unverified `Deleted` status).
     - `verifications/approve`: Reject approval attempts if the resident was permanently denied or soft-deleted.
  4. **Truthful UI, UX & Verification History**:
     - Provide distinct "Reject Registration" and "Deny Registration" actions in `verif-review-page.tsx`. Super Admin sees the permanent denial action.
     - Confirmation dialog "Deny Resident Registration?" requiring a 10-character reason, with loading states and duplicate-submit guards.
     - Display denied registrations distinctly in `history/page.tsx` with details, timestamps, and responsible admins.
     - In `lib/security/registration-status.ts`: Accurately report `status: "denied"` for denied residents so registration recovery renders truthful permanent denial notice instead of pending review.
- **Consequences**:
  - Eliminates the orphaned-Pending lifecycle inconsistency completely.
  - Safe soft deletion preserves all evidence, audit history, and uploaded documents without physical deletion.
  - Denied residents cannot authenticate, resubmit, or access any resident services.
  - Normal administrators cannot accidentally activate permanently denied accounts.

## ADR-025: Registration Lifecycle Hardening, Authoritative Account Precedence, and Coordination Closure (D01–D05)

- **Status**: Accepted / Verified
- **Date**: 16 October 2026
- **Context**:
  - Following the introduction of separate registration approval, correctable rejection, and permanent denial workflows, five functional inconsistencies were identified:
    1. **D01 (Critical)**: `resident.deactivate` lacked a permanent denial invariant, enabling a denied resident with `status: "Deleted"` to transition to `status: "Expired"`. Furthermore, authentication observers and route guards previously blocked only `Deleted` and `Locked`, meaning an expired denied resident could potentially regain application access.
    2. **D02 (High)**: `lib/security/registration-status.ts` checked historical completed operations in `registrationOperations` before inspecting the authoritative user record in `users/{uid}`, causing permanently denied applicants to receive a misleading "completed" registration status during recovery.
    3. **D03 (High)**: The permanent denial operation in `app/api/admin/operations/route.ts` maintained an ad-hoc list of active lock stages that omitted `reconciling`, an active coordination state defined in canonical `identity-coordination-policy.ts`.
    4. **D04 (Medium)**: Generic verification deletion (`verification.delete`) only blocked pending initial registration verifications, permitting physical deletion of rejected, denied, or approved registration verifications, destroying resubmission eligibility and evidence.
    5. **D05 (Low–Medium)**: `app/admin/verifications/history/page.tsx` filtered reasons by registration submission date rather than authoritative decision date (`rejectedAt`, `deniedAt`, `approvedAt`).
- **Decisions**:
  1. **Permanent Denial as an Independent Account Invariant (D01)**:
     - `app/api/admin/operations/route.ts`: `resident.deactivate`, `resident.activate`, `resident.delete`, and `resident.update` strictly reject accounts where `registrationDenied === true`, `deniedAt` is set, or `(!isVerified && status === "Deleted")` with HTTP 409 Conflict.
     - Generic operations cannot activate or deactivate unverified `Pending` applicants (HTTP 409).
     - `lib/auth/auth-context.tsx`: Snapshot listener immediately signs out and revokes sessions when `userData.registrationDenied === true || Boolean(userData.deniedAt)`. `login` function rejects sign-in attempts immediately.
     - `hooks/auth/use-auth-guard.ts`: `isLockedOrDeleted` check treats `user?.registrationDenied === true || Boolean(user?.deniedAt)` as disqualifying.
     - `firestore.rules`: `isActiveAccount()` strictly requires `user.get('registrationDenied', false) != true`.
  2. **Authoritative Current Account State Precedence in Registration Recovery (D02)**:
     - In `lib/security/registration-status.ts`, reordered evaluation order:
       1. Validate caller identity and token.
       2. Inspect authoritative Firestore document `users/{callerUid}` first.
       3. If `registrationDenied`, `deniedAt`, or soft-deleted, immediately return `{ status: "denied", denialReason: ... }`.
       4. If active or verified resident, return `{ status: "existing-resident" }`.
       5. If pending verifications exist, return `{ status: "completed" }` (or `"rejected"`).
       6. Only inspect `registrationOperations` when user profile does not exist or profile finalization is incomplete.
  3. **Canonical Identity Lock Coordination Alignment (D03)**:
     - In `app/api/admin/operations/route.ts`, imported and reused `ACTIVE_LOCKED_STAGES` from `lib/admin/identity-coordination-policy.ts` (including `reconciling`, `auth-mutating`, `auth-completed`, `compensating`, `reconciliation-required`).
     - `verification.denyRegistration` checks lock state against canonical active stages and rejects with HTTP 409 Conflict if active coordination is in progress. Also validates that `residentVerificationLocks.activeVerificationStatus !== "approved"`.
  4. **Preservation of All Registration Verification Records (D04)**:
     - In `app/api/admin/operations/route.ts`, `verification.delete` rejects generic physical deletion for all verification records with `type === "registration"` (HTTP 400).
     - Preserves rejected records (required for resubmission eligibility), denied records (required for evidence/audit), and approved records.
     - Legitimate non-registration verifications (`profile-edit`, `reactivation`) remain deletable.
  5. **Authoritative Decision Event Attribution in Verification History (D05)**:
     - Created `lib/security/verification-history-policy.ts` with `getAuthoritativeVerificationDecisionTimestamp`, `isVerificationInDecisionYear`, `getManilaEventMonth`, `getAvailableVerificationYears`, and `getTopReasonsByDecisionYear`.
     - Inspects `deniedAt`, `rejectedAt`, and `approvedAt` (never falling back to submission dates). Evaluates dates in Asia/Manila (+08:00) calendar time.
     - In `app/admin/verifications/history/page.tsx`, wired monthly charts and top reasons to the decision year policy.
  6. **Adjacent Lifecycle Hardening (Milestone 6)**:
     - Verification operations enforce single ownership: `residentId !== userId` throws HTTP 400.
     - `app/api/admin/update-resident-email/route.ts` rejects email updates for permanently denied accounts (HTTP 409).
     - `app/api/resident/requests/create/route.ts` rejects request creation for denied accounts (HTTP 403).
     - `app/api/media/view/route.ts` and `lib/security/media-auth.ts` reject media delivery for denied accounts (HTTP 403).
     - `lib/security/registration-resubmission.ts` rejects resubmission from denied accounts (HTTP 403).
- **Consequences**:
  - Permanently denied accounts can never be reactivated, converted to Expired, or regain access to services.
  - Registration recovery truthfully reports permanent denial regardless of historical operations.
  - Identity coordination locks prevent race conditions between registration denial and background reconciliation or approvals.
  - Verification history and audit trails remain permanently intact.
  - Verification reports accurately attribute reasons and actions to their decision periods.
## ADR-026: Denied-Account Authorization, Live Session Revocation, and Test Evidence Alignment (E01–E05)

- **Status**: Accepted / Verified
- **Date**: 16 October 2026
- **Context**:
  - Following the implementation of D01–D05, five final authorization and functional consistency items were identified:
    1. **E01 (High)**: While `firestore.rules` defined `isActiveAccount()`, multiple collections (`documentRequests`, `verifications`, `notifications`, `systemAlerts`, `systemConfig`) relied on `isAuthenticated()` or ownership without requiring an active account, allowing permanently denied residents retaining valid Firebase Auth tokens to read or mutate resources directly through the client SDK.
    2. **E02 (High)**: In `lib/auth/auth-context.tsx`, the `users/{uid}` snapshot listener logged errors without revoking the authenticated state when receiving `permission-denied` errors, creating a risk that a denied user's browser session remained active using stale privileges.
    3. **E03 (Medium)**: The D02 regression test seeded a completed registration operation under the raw `operationId` rather than the canonical `registrationOperationDocumentId(uid, operationId)`, failing to test realistic production operation recovery.
    4. **E04 (Low–Medium)**: `lib/security/verification-history-policy.ts` utilized `?? verification.updatedAt` as a fallback for decision dates, risking false attribution of historical decisions to subsequent update dates.
    5. **E05 (Medium)**: Directly affected client/backend paths required verification to guarantee consistent denial enforcement across all endpoints.
- **Decisions**:
  1. **Strict Active-Account Invariant in Firestore Rules (E01)**:
     - Tightened `isActiveAccount()` to block `role == 'Deleted'`, `registrationDenied == true`, `'deniedAt' in user`, and unverified accounts with `Deleted` or `Expired` status.
     - Required `isActiveAccount()` for resident operations on `documentRequests`, `verifications`, and `notifications`.
     - Required `isActiveAccount()` for reads on `systemAlerts` and `systemConfig`.
  2. **Fail-Closed Real-Time Session Revocation (E02)**:
     - Handled `permission-denied` and `unauthenticated` errors in `onSnapshot` listener: executed `firebaseSignOut(auth)`, cleared `user` state, cleared Storage and disclaimer tokens, and redirected to `/auth/login`.
     - Caught client profile fetch `permission-denied` on login, rejected with informative deactivation notice.
  3. **Canonical Operation ID in Regression Tests (E03)**:
     - Imported and used `registrationOperationDocumentId` from `lib/security/registration-finalization.ts` in test fixtures.
     - Verified normal operation recovery works before denial, and denial takes strict precedence after denial.
  4. **Removal of Misleading Decision-Date Fallbacks (E04)**:
     - Removed `?? verification.updatedAt` fallback across `denied`, `rejected`, and `approved` states in `lib/security/verification-history-policy.ts`.
     - Maintained honest unknown-date handling when authoritative event timestamps are missing.
  5. **Adjacent Route Hardening (E05)**:
     - Enforced denial and unverified expiration checks across `operations`, `approve`, `update-resident-email`, and `media/view`.
- **Consequences**:
  - Permanently denied accounts fail closed even with valid Auth tokens across direct Firestore client operations and backend routes.
  - Active browser sessions are authoritatively revoked in real time when registration is denied.
  - Test fixtures faithfully mirror production key derivation.
  - Verification history metrics accurately reflect original decision events.

## ADR-027: Canonical Document Catalog, Request Lifecycle, and UI/UX Integration (UI01–UI19)

- **Status**: Accepted / Verified
- **Date**: 16 October 2026
- **Context**:
  - Independent audit identified 19 UI/UX, frontend–backend integration, and request lifecycle defects:
    1. **UI01 & UI16**: Document generation lacked a canonical catalog; Barangay Clearance ambiguously mapped to Business Clearance.
    2. **UI02**: Requests made on behalf of another person erroneously rendered the requester's profile details on official documents.
    3. **UI03**: Backend allowed marking requests generated in terminal/pending states and completing without generation or payment confirmation.
    4. **UI04**: Notification rules permitted View Only admins client write access.
    5. **UI05**: Retry button passed display titles rather than internal IDs and failed to prefill.
    6. **UI06**: "Pay at Barangay Hall" retained GCash payment method in request submissions.
    7. **UI07**: Additional Details textarea was dropped between frontend and backend.
    8. **UI08**: Payment submission failed when notification emission rejected after payment update.
    9. **UI09**: Notification "Mark All as Read" completed prematurely without awaiting backend write.
    10. **UI10**: Super Admin configuration wrote immediately on toggle rather than staging with "Save All Changes".
    11. **UI11**: Admin Payment Process modal captured stale snapshot objects.
    12. **UI12**: Completed request metrics counted On Process and Ready for Pick Up as Completed.
    13. **UI13**: Broadcast notifications swallowed partial failures.
    14. **UI14**: Document generator assumed print success and marked generated on blocked popups.
    15. **UI15**: Admin accounts displayed hardcoded fabricated online presence.
    16. **UI17**: Admin table broke out horizontally on narrow mobile screens.
    17. **UI18**: Year selector initialized to invalid year before asynchronous Firestore data loaded.
    18. **UI19**: Viewport responsiveness across 5 screen sizes needed validation.
- **Decisions**:
  1. **Canonical Document Catalog (`lib/document-catalog.ts`)**:
     - Single canonical repository for 10 built-in types, templates, headings, fees, aliases, and `resolveDocumentSubject`.
  2. **Strict Request Lifecycle Policy**:
     - `request.markGenerated` rejects terminal and pending requests.
     - `request.updateStatus` to `Completed` requires `hasGenerated === true` and paid/waived fee.
  3. **Flat Notification Rules Authorization**:
     - Replaced deeply nested rules checks with a single-expression role check in `firestore.rules`, denying View Only and avoiding Firestore's 1000-expression limit.
  4. **Decoupled Payment and Notification Delivery**:
     - Payment mutation outcome is reported truthfully even if notification emission encounters errors.
  5. **Reactive State Binding**:
     - Admin payment modal subscribes to live Firestore requests by ID to avoid race conditions.
  6. **Unified Configuration Staging**:
     - Local staging of configuration edits with dirty indicators and atomic Save All Changes.
  7. **Truthful Metrics & Reconciled Selectors**:
     - Strict status filtering for completed metrics; reactive year selection reconciliation on data load.
- **Consequences**:
  - Correct templates generated for all document types.
  - Representations accurately identify beneficiaries and requesters.
  - Request lifecycle transitions are strictly governed server-side.
  - UI state and backend persistence remain synchronized with truthful user feedback.

## ADR-022: P01–P07 Document Integrity, Permission Governance & Configuration Synchronization
- **Context**:
  Independent post-remediation audit identified seven integration and authorization gaps:
  1. **P01**: Documents requested on behalf of another person erroneously reused the requesting resident's age and address for the beneficiary.
  2. **P02**: Super Admin disabling all document types was treated as uninitialized (`.length === 0`), causing fallback to saved configuration.
  3. **P03**: Canonical Barangay Clearance template contained unresolved `{{civil_status}}` placeholder token.
  4. **P04**: View Only administrators could create admin alerts or update notifications due to permissive exceptions and `isAnyAdmin()` in `firestore.rules`.
  5. **P05**: Document reprints in `request.markGenerated` unconditionally overwrote original `generatedAt` timestamp, distorting historical reporting period metrics.
  6. **P06**: Background Firestore snapshot updates in Super Admin configuration overwrote unsaved local form edits across branding, signatures, and templates.
  7. **P07**: Duplicate document catalog dictionaries existed across pages and could drift from canonical definitions.
- **Decisions**:
  1. **Tripartite Identity Separation (P01)**:
     - Formally distinguish Requester (submitting resident), Representative (authorized legal proxy), and Document Subject (beneficiary appearing on the certificate).
     - `resolveDocumentSubject()` enforces that for represented requests (`requestFor === "other"`), the beneficiary name is authoritative; requester address and age are NEVER substituted.
     - Detect missing beneficiary data (`isSubjectAddressMissing`, `isSubjectAgeMissing`) and display an Admin confirmation banner with override inputs prior to issuance.
  2. **Explicit Nullable Configuration Staging (P02)**:
     - Represent staged document types as `string[] | null` where `null` is uninitialized and `[]` is an intentional empty configuration disabling all types.
     - Backend API respects empty array `documentTypes: []`, disabling resident document creation when all types are deactivated.
  3. **Standardized Template Contract & Token Stripping (P03)**:
     - Remove unsupported `{{civil_status}}` from default Barangay Clearance template.
     - Implement `renderDocumentTemplate()` that HTML-escapes values, cleanly strips unparsed `{{...}}` tokens, and handles optional values without token leakage.
  4. **Strict View Only Denial & Read-Only Notification Scope (P04)**:
     - Require `getUserRole() == 'resident'` for resident alert creation exceptions in `firestore.rules`.
     - Explicitly block View Only (`!isViewOnly()`) from notification create, update, and delete rules.
     - Restrict client notification updates strictly to `isRead` modification.
  5. **Immutable First-Generation History (P05)**:
     - `request.markGenerated` checks existing document state: preserves initial `generatedAt`, sets `lastReprintedAt`, and increments `reprintCount`.
  6. **Comprehensive Dirty Tracking & Snapshot Collision Protection (P06)**:
     - Implement unified `isDirty` tracking across branding, contact numbers, official signatures, and document templates.
     - Snapshot listener suppresses overwriting dirty fields and displays a background update warning banner.
  7. **Canonical Document Catalog Consolidation (P07)**:
     - `lib/document-catalog.ts` is the single source of truth for static definitions (10 built-in types, templates, fees).
     - Dynamic Firestore configuration governs enabled status, fee overrides, and custom templates.
     - Preserves disabled state for newly introduced types on legacy deployments until explicitly enabled.
- **Consequences**:
  - Official documents contain truthful subject data with zero identity blending.
  - View Only administrators are genuinely read-only across Firestore client access.
  - Empty configurations persist and reload reliably.
  - Historical generation attribution in reports remains tamper-proof across reprints.
  - Administrator form edits are protected against concurrent snapshot loss.

## ADR-023: R01–R07 Remediation, Concurrency Protection, and Truthful Beneficiary Verification
- **Context**:
  Independent post-remediation audit identified seven operational and verification defects:
  1. **R01**: Document formatting collapsed multiple paragraphs into a single paragraph because whitespace normalization regex `/\s{2,}/g` collapsed newlines.
  2. **R02**: Configuration screen falsely reported background changes whenever local `isDirty` changed because the effect subscribed to `isDirty`.
  3. **R03**: Concurrent configuration saves could overwrite newer changes because frontend submitted full snapshots without version-aware transactions.
  4. **R04**: View Only notification preview triggered forbidden Firestore writes (`markNotificationRead`) on unread notifications.
  5. **R05**: Beneficiary fields were labelled "Verified" merely if non-empty, even when self-reported and unreviewed.
  6. **R06**: Admin-confirmed beneficiary details were stored only in ephemeral React state and lost on refresh or navigation.
  7. **R07**: Test isolation was incomplete; previous tests altered system config without restoring exact initial snapshots, and failed to test real representation API submissions or print preparation.
- **Decisions**:
  1. **Document Paragraph Preservation (R01)**:
     - Replace whitespace regex with horizontal-only normalization `/[ \t]{2,}/g`, preserving `\n\n` paragraph boundaries and intentional line breaks.
     - Export `formatTemplateParagraphs` converting `\n\n` into semantic `<p>` blocks and single newlines into `<br />`.
  2. **Decoupled Dirty & External Conflict Tracking (R02)**:
     - Decouple `isDirty` from synchronization effect dependencies; introduce `baselineConfigRef`, `isDirtyRef`, `initialSyncDoneRef`, and `isMeaningfulConfigChange` helper.
     - Gate baseline initialization on `isConfigLoaded` to prevent treating initial Firestore connection as a remote modification.
     - Provide explicit "Discard Changes" workflow resetting local draft to authoritative server state.
  3. **Server-Authoritative Concurrency Protection (R03)**:
     - Add `version` field to `systemConfig` (numeric integer incremented on each mutation).
     - Implement optimistic concurrency in `app/api/admin/operations/route.ts`: transactionally verify `baseVersion`.
     - When versions differ, detect whether modified fields overlap with remote changes using `baseConfig`. Overlapping field edits reject with HTTP 409 Conflict and list `conflictingFields`. Non-overlapping field edits safely merge and increment version.
     - Surface HTTP 409 conflict notifications in UI without erasing local draft.
  4. **Strict Non-Mutating View Only Preview (R04)**:
     - Export `canManageNotificationsRole` in `lib/auth/auth-types.ts` returning `false` for View Only.
     - Conditionally guard `markNotificationRead` call when opening preview modal; hide broadcast bar and mark-all-as-read buttons for unauthorized roles.
  5. **Truthful 3-State Beneficiary Status (R05)**:
     - Replace misleading binary "Verified" badge with 3-state truthful review status: `missing` (Red), `provided` / Unreviewed (Amber), and `confirmed` / Confirmed by Staff (Green).
     - Base verification badges strictly on authoritative persisted metadata, never on non-empty self-reported strings.
  6. **Authoritative Persisted Beneficiary Corrections (R06)**:
     - Introduce `request.confirmBeneficiary` operation in `app/api/admin/operations/route.ts` persisting confirmed address, age, reviewer ID, and timestamp with audit logging.
     - Persist confirmed subject values in `request.markGenerated` and pass them during PDF download and print workflows.
     - Prioritize confirmed values in `resolveDocumentSubject`; guard React inputs with `loadedRequestIdRef` and `isEditingBeneficiaryRef` to prevent active input overwriting on background refreshes.
  7. **Hermetic Test Isolation & End-to-End Workflows (R07)**:
     - Implement exact `initialConfigSnapshot` capture and restoration in `try...finally` blocks for all tests modifying system configuration.
     - Implement end-to-end test scenarios (A through F) covering resident representation API submission, admin preview, print preparation with popup blocked scenarios, concurrent configuration 409 conflict, local edit conflict isolation, and View Only notification preview.
- **Consequences**:
  - Official certificates maintain paragraph structure and indentation without unparsed token leakage.
  - Concurrent configuration saves cannot silently overwrite remote edits.
  - View Only administrators can browse notifications without triggering authorization denials or Firestore writes.
  - Beneficiary details are accurately labelled and permanently stored in official records.
  - Test suites execute hermetically without shared state contamination.

## ADR-024: Authoritative Configuration Concurrency, Beneficiary Confirmation Decoupling, and Issuance Integrity (F01–F06)
- **Context**:
  Independent post-remediation audit following R01–R07 identified six targeted defects:
  1. **F01**: Add/Delete Document Type submitted entire configuration object without `baseVersion`, bypassing backend concurrency checks.
  2. **F02**: `request.markGenerated` accepted arbitrary beneficiary inputs and synthesized confirmation status, bypassing explicit staff confirmation.
  3. **F03**: Admin generator displayed "✓ Confirmed by Staff" badge even after local edits altered the address or age away from the confirmed value.
  4. **F04**: Validation rules differed across endpoints; `confirmBeneficiary` checked age ranges while `markGenerated` accepted arbitrary unchecked fields.
  5. **F05**: E2E browser tests created requests, media registry records, and notifications without cleaning them up in `try...finally`.
  6. **F06**: E2E tests verified preview content but did not verify actual PDF download streams, valid `%PDF-` binary magic bytes, or partial failure handling.
- **Decisions**:
  1. **Authoritative Concurrency on All Configuration Mutations (F01)**:
     - Require valid `baseVersion` precondition on all `system.config.update` calls when config exists; reject omission with HTTP 400.
     - Evaluate concurrency inside Firestore transaction; merge non-conflicting fields and reject overlapping edits with HTTP 409 Conflict.
     - In `app/superadmin/config/page.tsx`, `handleAddDocType` and `handleDeleteDocType` submit minimal payloads (`documentTypes`, `documentFees`, `customDocumentTypes`, `templates`) with `baseVersion` and `changedFields`; on 409 conflict, preserve unsaved state and keep dialog open.
  2. **Decouple Confirmation from Issuance (F02)**:
     - Establish `request.confirmBeneficiary` as the sole authoritative operation for staff confirmation.
     - In `request.markGenerated`, strictly require that represented requests possess authoritative persisted staff review (`beneficiaryReviewStatus === "confirmed"`, `beneficiaryConfirmedAt`, `confirmedBeneficiaryAddress`); client generation payloads cannot manufacture confirmation.
     - Persist immutable issuance snapshot (`issuanceBeneficiaryAddress`, `issuanceBeneficiaryAge`, `issuanceBeneficiaryName`); preserve original `generatedAt` on reprint.
  3. **Dynamic Invalidation of Stale Confirmation Badges (F03)**:
     - Update `resolveDocumentSubject` in `lib/document-catalog.ts` to compare active form inputs against persisted confirmed values.
     - Transition review status to `"modified"` with `Modified — Requires Reconfirmation` badge when local edits differ from confirmed values; restore `"confirmed"` status if inputs revert to match.
     - Guard Download PDF and Print handlers in `app/admin/generate/page.tsx` to strictly block issuance while in `"modified"` state.
  4. **Single Shared Beneficiary Validation Policy (F04)**:
     - Consolidate validation into `validateBeneficiaryDetails(input, options)` in `lib/document-catalog.ts`.
     - Enforce consistent constraints: address presence and length (max 300), age range (finite integer 0–130) when required or provided, name length (max 150), notes length (max 500), and reject unapproved payload fields across all endpoints.
  5. **Hermetic Test Fixture Isolation (F05)**:
     - Wrap all fixture-creating Playwright tests in `try...finally` teardown blocks to delete test-created document requests, media registry records, and notifications.
  6. **Real PDF Stream & Output Verification (F06)**:
     - Exercise actual Download PDF button in Playwright, capture browser download event, read stream, and verify valid PDF magic bytes (`%PDF-`).
     - Test partial failure behavior where PDF downloads to user's device but server database recording fails: display truthful warning toast, preserve downloaded file, and keep user in generator.
- **Consequences**:
  - Configuration mutations cannot bypass version-aware concurrency checks.
  - Represented-person certificates cannot be issued without authoritative staff review.
  - Active form modifications immediately invalidate confirmed status.
  - Validation rules are unified across all endpoints.
  - Test suites execute cleanly without leaving lingering records.
  - PDF generation and partial failures are fully verified against real browser downloads.

## ADR-025: Unsaved Configuration State Isolation, Issuance Semantics Preservation, and Production-Path Verification (V01–V04)
- **Context**:
  Independent review identified four final findings prior to hands-on acceptance testing:
  1. **V01 (High)**: Adding or deleting document types unconditionally cleared `isDirty`, allowing subsequent background Firestore snapshot updates to overwrite unrelated unsaved branding, contact, signature, or template changes.
  2. **V02 (High)**: Document generator used latest confirmed beneficiary details or today's date when reopening an already-issued request, allowing reprinted documents to diverge from the original recorded issuance snapshot.
  3. **V03 (Medium)**: `request.confirmBeneficiary` accepted an optional confirmed beneficiary name while `resolveDocumentSubject` continued reading `requestedByName`, allowing confirmed identity and document subject to disagree.
  4. **V04 (Medium)**: Some unit tests simulated production logic via local functions (`simulateConfigUpdateTransaction()`, local `checkIssuanceEligibility()`) rather than executing actual exported production handlers and policies.
- **Decisions**:
  1. **Dynamic Dirty State and Draft Isolation (V01)**:
     - Separate saved authoritative configuration, locally edited draft fields, catalog additions/deletions, and pending unsaved changes in `app/superadmin/config/page.tsx`.
     - In `handleAddDocType` and `handleDeleteDocType`, commit only catalog fields (`documentTypes`, `documentFees`, `customDocumentTypes`, and the specific document template) and update `baselineConfigRef.current` with only those committed fields.
     - Recompute dirty state dynamically across all editable fields against the updated baseline; if unrelated edits (branding, contact, signatures, other templates) remain, keep `isDirty` as `true`.
     - In the Firestore snapshot sync effect, prevent background snapshots from overwriting active drafts when `isDirty` is true.
     - Preserve version-aware optimistic concurrency enforcement on all server mutations.
  2. **Strict Preservation of Original Issuance and Explicit Corrected Issuance (V02)**:
     - Distinguish original issuance, archival reprint, and authorized corrected issuance.
     - On first generation, record immutable issuance snapshot (`issuanceBeneficiaryName`, `issuanceBeneficiaryAddress`, `issuanceBeneficiaryAge`, `generatedAt`, `issuanceDate`).
     - On reprint (`hasGenerated === true`), `resolveDocumentSubject` and `request.markGenerated` strictly reproduce original snapshot values and original issuance date; normal reprint cannot silently mutate original issuance.
     - Introduce explicit authorized, audited `request.reissueCorrected` operation that archives superseded issuance history with correction reasons and audit logging.
  3. **Unified Authoritative Identity Contract (V03)**:
     - Disallow routine confirmation from substituting beneficiary identity (`confirmBeneficiary` validates that confirmed name matches requested name).
     - Align `resolveDocumentSubject`, `request.markGenerated`, and issuance snapshot around the authoritative identity hierarchy.
  4. **Production-Path Verification (V04)**:
     - Replace simulation test functions with direct execution of production route handlers (`createAdminOperationsHandler`) and production policies.
     - Validate PDF download content and reprint consistency in Playwright tests with strict `try...finally` fixture cleanup.
- **Consequences**:
  - Super admins can add or delete document types without losing in-progress drafts.
  - Reprints reliably reproduce original issuance artifacts.
  - Stored beneficiary names and document subjects cannot disagree.
  - Tests prove actual production code invariants without simulation drift.
