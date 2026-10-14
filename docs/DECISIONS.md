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


