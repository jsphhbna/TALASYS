# TALASYS Remediation Handoff

## Current state — 2026-10-14

Working branch: `main`.

The remaining consistency and migration defects in this pass are implemented
and verified locally. No production deployment, Firestore Rules publication,
production account change, data migration, or Cloudinary migration was
performed.

## Implemented in this pass

- Firestore client rules now deny direct approval/rejection, administrator
  resident mutation, request-processing mutation, audit mutation, and system
  configuration mutation. Resident self-service remains limited to explicit
  contact/photo, deactivation, cancellation, and payment-submission fields.
- Approval and rejection are trusted server operations. Approval carries a
  persisted attempt ID through claim, completion, failure, compensation, and
  reconciliation; every transition rechecks ownership so a stale attempt
  cannot release state or revert a newer Auth identity.
- The legacy resident-email endpoint now uses a durable identity coordinator:
  intent precedes Firebase Auth, retries recognize the intended Auth state,
  Firestore profile/audit finalization is atomic, and compensation is fenced.
  Verification-only roles cannot use it as a general resident editor.
- Resident lifecycle/profile operations, request status/payment operations,
  administrator management, alerts, configuration, and notifications now use
  typed server operations. Audit events are derived server-side and written in
  the same Firestore transaction as their mutation. New administrator Auth
  creation uses deterministic operation identity plus compensation/reconciliation.
- Cloudinary migration transactions read and validate every referenced
  document before writing. Exact paths are compared with the scanned original,
  so concurrent changes are not overwritten.
- Cloudinary manifests now checkpoint intent before provider mutation and keep
  the completed stage separate from failure details. Resume can recover a
  provider-completed entry even when a fresh scan no longer contains the old
  URL, while ambiguous provider state blocks another rename.
- Every distinct original delivery URL is checked. `401`, `403`, and `404` are
  classified as unavailable; network errors, `429`, and `5xx` remain ambiguous
  after bounded retries and block success. Authenticated asset existence and a
  signed authorized delivery are checked separately.
- The client and Admin SDK can connect to isolated Auth/Firestore emulators.
  The browser matrix uses real emulator identities for View Only, Verification
  Only, Document Processing, Resident Management, Full Access, locked/deleted,
  and live role-change cases. It exercises approval, rejection, and resident
  deactivation through the actual UI and server routes.
- Login routing now derives from the canonical role policy, fixing specialized
  roles that previously fell through to the resident portal.

## Reproducible local evidence

- `npm test` — PASS, 124/124.
- `npm run test:rules` — PASS, 9/9 across Firestore rules and the real Admin
  Firestore migration adapter (including a concurrent-reference change veto).
- `npm run typecheck` — PASS.
- `npm run typecheck:test` — PASS.
- `npm run lint -- --quiet` — PASS with zero errors. Non-quiet legacy warnings
  were not used as a zero-warning claim.
- `npm run build` — PASS; Next.js 16.4.0 generated 46 routes.
- `npm run test:e2e:auth` — PASS, 12/12 authenticated Chromium workflows.

The Firebase emulator CLI on this Windows/Node 26 environment can leave its
Firestore JVM after `emulators:exec` exits. During verification, only the exact
TALASYS emulator process bound to the configured test port was stopped.

## Remaining production boundaries

1. Live Cloudinary/CDN enforcement is not verified because no safe provider
   credentials or test product environment were supplied. Production rename,
   old-public denial, signed delivery, invalidation propagation, and migration
   remain operator/deployment checks.
2. No production rules deployment or migration was run. Those actions still
   require confirmed project/cloud identities, backups, a maintenance window,
   dry-run and manifest review, monitoring, rollback ownership, and credentials.
3. Dependency audits were not rerun in this pass. The 2026-10-13 handoff record
   remains historical evidence: production had no high/critical advisories,
   while development tooling retained transitive advisories.

## Operator commands (production requires separate approval)

- Audit preview: `npm run migrate:audit-timestamps -- --limit 10000`
- Cloudinary preview: `npm run migrate:cloudinary-access`
- Cloudinary commit: add `-- --commit` only after reviewing the manifest target,
  backup, credentials, and rollback plan.
- Authenticated local acceptance: `npm run test:e2e:auth`

Required runtime configuration includes Firebase client/Admin credentials,
Cloudinary cloud/API credentials, `REGISTRATION_TICKET_SECRET`, and optionally
`TRUSTED_PROXY_IP_HEADER` when one exact trusted proxy header is documented.
