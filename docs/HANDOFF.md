# TALASYS Remediation Handoff

## Current state — 2026-10-13

Branch: `remediation/61-findings`.

This branch is not represented as production-complete. It contains substantial
local remediation and reproducible evidence, but M6, M7, and parts of M9/M10
remain open. No production deployment, Firestore Rules publication, account
provisioning, data migration, or Cloudinary migration was performed.

## Implemented and locally verified

- Audit timestamp migration: dry-run first, canonical `activityLogs`, bounded
  fresh batches, invalid-value reporting, restart cursor, original-value
  history, partial-failure reporting, and rollback guidance.
- Cloudinary migration: real Rename API integration, schema field discovery,
  exact identity and foreign-cloud rejection, deduplication, checkpoint/resume,
  transactional reference updates, and old/new access verification hooks.
- Super-admin provisioning: hidden password input, explicit existing-account
  promotion/reset flags, profile preservation, durable operation state,
  compensation, reconciliation, and audit evidence.
- Verification approval: authenticated server handler, authoritative state,
  transaction lease/claim, idempotency, Auth retry/compensation, deterministic
  notification/audit IDs, and incomplete-state reporting.
- Request creation: server-resolved enabled/custom document types and fees,
  explicit waiver policy only, account expiry checks, idempotent transaction,
  and resident direct-create denial in rules.
- Audit boundary: clients cannot write `activityLogs`; `/api/audit/log` accepts
  allowlisted non-authoritative telemetry only; forwarding headers are ignored
  unless one exact trusted proxy header is configured.
- Media boundary: official Cloudinary SDK signing, exact asset identity,
  authoritative record attachment checks, scoped role/owner authorization,
  protected upload IDs, and fail-closed viewers without original-URL fallback.
  An authenticated signed Cloudinary URL is correctly described as non-expiring.
- Verification-only policy/navigation: only verification routes and scoped
  workspace content are exposed for both supported verification roles.
- Vulnerable `xlsx` was replaced by ExcelJS; production dependency audit has
  no high or critical advisories. The Firebase browser gRPC tree is overridden
  to a patched release.

## Reproducible local evidence

- `npm test` — 110/110 pass.
- `npm run test:rules` — 5/5 pass in the Firestore Emulator.
- `npm run typecheck` — pass.
- `npm run typecheck:test` — pass.
- `npm run lint -- --quiet` — pass with app, scripts, and tests included.
  Running without `--quiet` exposes existing warnings; do not claim zero warnings.
- `npm run build` — pass; 45 application routes.
- Playwright against an externally managed local Next server — 4/4 pass for
  desktop/mobile unauthenticated redirect and public/login horizontal reflow.
- `npm audit --omit=dev` — zero critical/high, two moderate ExcelJS/uuid.
- Full `npm audit` — 11 high and 5 moderate in development tooling.

The deleted `test/reopened-remediation.test.ts` copied/simulated suite is not
acceptance evidence. Controlled dependency tests are labelled as such in
`docs/EVIDENCE_LEDGER.md`.

## Exact remaining blockers

1. M6 authoritative audit coupling: several legacy privileged mutations still
   execute in client hooks. Their former direct `activityLogs` writes were
   removed, but UI telemetry after a mutation is not authoritative evidence.
   Move each mutation into a typed server operation that commits its derived
   audit event with the Firestore mutation, with explicit cross-service
   recovery where Firebase Auth is involved. Findings #6/#31/#61 remain open
   for those paths.
2. M7 provider proof: Cloudinary token-auth expiry requires a separate token
   key/eligible plan or an application proxy. No safe provider test account was
   supplied, so expired-link rejection, old-public denial, CDN invalidation,
   and the production migration are unverified and deployment-pending.
3. M9/M10 authenticated browser matrix: local Firebase test identities and an
   Auth/Firestore emulator-integrated app setup are needed to drive View Only,
   Verification Only, Document Processing, Resident Management, Full Admin,
   locked/deleted, and live role-change sessions end to end. Current browser
   evidence is smoke coverage only.
4. Dependency tooling: the production high-severity gate passes, but the full
   audit retains high advisories in Firebase CLI and ESLint transitive trees.
   Do not run `npm audit fix --force`; npm proposes breaking/downgrade changes.
5. Production migrations and rules deployment require an approved maintenance
   window, backups, real credentials, project-ID confirmation, dry-run review,
   monitoring, and rollback ownership.

## Operator commands (do not run against production without approval)

- Audit migration preview: `npm run migrate:audit-timestamps -- --limit 10000`
- Audit migration commit: add `--commit` only after backup/project review; use
  `--start-after <document-id>` to resume.
- Media migration preview: `npm run migrate:cloudinary-access`
- Media migration commit: add `-- --commit` only after manifest backup and a
  safe provider validation window.
- Super-admin provisioning: `npm run seed:superadmin -- --email <email>`;
  existing accounts require explicit `--promote-existing` and/or
  `--reset-password`.

Required runtime configuration includes Firebase client/Admin credentials,
Cloudinary cloud/API credentials, `REGISTRATION_TICKET_SECRET`, and optionally
`TRUSTED_PROXY_IP_HEADER` set to the single exact header injected by the trusted
hosting proxy. Leave it unset if that contract is not documented.
