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
