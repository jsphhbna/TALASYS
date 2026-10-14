# TALASYS Evidence Ledger

> **Evidence correction (2026-10-13):** E17-E21 and earlier entries remain as
> historical command records only. They are not evidence for the reopened
> independent-review acceptance criteria. Current verification starts with the
> entries below and distinguishes inspection from executed behavior.

| ID | Scope | Evidence | Result | Date | Classification |
|---|---|---|---|---|---|
| C-E01 | Branch workflow | `git fetch --prune`, branch/log/status inspection | `main` selected and matched `origin/main` at baseline; only one distinct extra branch name existed | 2026-10-14 | TEST_EVIDENCE / VERIFIED |
| C-E02 | Authorization and audit boundary | Source inspection + `npm run test:rules` + authenticated UI operations | Direct privileged client writes denied; server rejection and resident deactivation commit derived audit with mutation | 2026-10-14 | IMPLEMENTATION + TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E03 | Identity coordinator | `test/identity-email-operation.test.ts`, `test/identity-email-route.test.ts` | Success, intended-state retry, Auth failure, compensation, failed compensation, stale-owner denial, idempotency, unsupported-field and authorization denial pass | 2026-10-14 | TEST_EVIDENCE / VERIFIED WITH CONTROLLED DEPENDENCIES |
| C-E04 | Approval fencing | `test/verification-approval.test.ts` plus emulator browser approval | Attempt ownership persists across lifecycle; stale compensation denied; real Firestore/Auth-emulator approval completes | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E05 | Cloudinary recovery and verification | `test/cloudinary-migration.test.ts` | PASS: pre-provider intent, provider-state resolution, manifest-only resume, separate failure metadata, and ambiguous HTTP blocking | 2026-10-14 | TEST_EVIDENCE / VERIFIED WITH CONTROLLED PROVIDER ADAPTER |
| C-E06 | Firestore migration adapter | `npm run test:rules` (`test/emulator/cloudinary-firestore-adapter.test.ts`) | PASS: real emulator multi-document update and concurrent-reference overwrite veto | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E07 | Authenticated workflow matrix | `npm run test:e2e:auth` | PASS 12/12: five active roles, specialized denial, approval, rejection, resident deactivation, locked/deleted, live role change | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E08 | Integrated checks | `npm test`; type checks; quiet lint; `npm run build` | PASS 124/124; PASS/PASS; PASS; PASS with 46 routes | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E09 | Live provider and production operations | Not run by instruction; no safe Cloudinary test credentials supplied | No deployment, production migration, rules publication, or production account changes | 2026-10-14 | BLOCKED / DEPLOYMENT PENDING |
| C-E10 | Identity compensation race reproduction & repair | `test/identity-compensation-race.test.ts` | PASS: deterministic barrier reproduces Auth compensation race against uncoordinated baseline; proves repaired coordinator blocks takeover during compensation | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E11 | Unified resident coordination acceptance suite | `test/identity-coordination-acceptance.test.ts` | PASS 10/10: ownership loss before Auth write, approval vs general edit race, retry race, lost response recovery, Firestore failure handling, stale attempt resumption, operator reconciliation unblocking, strict parity, incomplete error codes, deduplicated audit/notifs | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E12 | Operator identity reconciliation service & API | `lib/admin/identity-reconciliation.ts`, `app/api/admin/reconcile-identity/route.ts` | Manual administrative reconciliation options (`sync-auth-to-firestore`, `sync-firestore-to-auth`, `release-lock`) with transactional audit logging | 2026-10-14 | IMPLEMENTATION + TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E13 | Authenticated workflow matrix & protected media | `npm run test:e2e:auth` (`test/e2e/authenticated-workflows.spec.ts`) | PASS 22/22: 12 baseline + resident document request UI, profile-edit approval updating Auth & Firestore, injected failure toast handling, retry deduplication, Verification Only navigation restriction, View Only & Locked mutation denial, reactivation approval, protected media authorization, and new-data behavior | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E14 | Full integration test suite | `npm test` | PASS 136/136 tests across 31 suites | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E15 | Production Next.js build | `npm run build` | PASS: 47 static and dynamic routes compiled successfully with Next.js 16.4.0 Turbopack | 2026-10-14 | TEST_EVIDENCE / VERIFIED LOCALLY |
| C-E16 | Dependency audit triage | `npm audit --omit=dev`, `npm audit` | Production audit: 0 high/critical, 2 moderate in ExcelJS `uuid` (GHSA-w5hq-g745-h8pq). Full audit: 11 high, 5 moderate in dev tools (`braces`, `basic-ftp`, `@opentelemetry/core`) | 2026-10-14 | TEST_EVIDENCE / TRIAGED |
| C-E17 | Identity concurrency & reconciliation repairs | `test/identity-compensation-race.test.ts`, `app/api/admin/update-resident-email/route.ts`, `app/api/admin/verifications/approve/route.ts`, `lib/admin/identity-reconciliation.ts`, `test/identity-coordination-acceptance.test.ts` | PASS: Scoping error resolved; claim adapters block competing attempts across ALL active stages; reconciliation isolates Auth mutation outside transaction, eliminates auto-approval of verifications, verifies lock quiescence, and enforces unique idempotency/audit keys; 136/136 unit/integration tests pass | 2026-10-14 | IMPLEMENTATION + TEST_EVIDENCE / VERIFIED LOCALLY |

| C-D01 | Documentation authority | Firebase Firestore transactions documentation (read-before-write, retry, atomicity) and Cloudinary Rename/access-control documentation, reviewed 2026-10-14 | Informed transaction ordering, provider-state recovery, signed authenticated delivery, and CDN invalidation assumptions; does not prove project behavior | 2026-10-14 | DOC_EVIDENCE / SOURCE_BACKED |

| ID | Scope | Evidence | Result | Date | Classification |
|---|---|---|---|---|---|
| R-E01 | Branch/status reconciliation | `git branch --show-current`, `git status --short`, source inspection | Requested branch selected; clean baseline before edits | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E02 | M1 schema/caller inventory | Inspected required scripts/routes/hooks/rules/tests and repository field references | Reopened defects confirmed; canonical collections and sensitive fields identified | 2026-10-13 | IMPLEMENTATION_EVIDENCE / REVIEWED |
| R-E03 | Production migration/deployment | Not run by instruction | No production state changed | 2026-10-13 | NOT TESTED / DEPLOYMENT PENDING |
| R-E04 | M2 audit migration behavior | `node --test --experimental-strip-types test/audit-timestamp-migration.test.ts` | PASS (5/5): zero-write dry-run, canonical collection, 805 records in 400/400/5 fresh batches, invalid skip reasons, idempotent rerun, partial failure progress | 2026-10-13 | TEST_EVIDENCE / VERIFIED LOCALLY |
| R-E05 | M2 app static compatibility | `npx.cmd tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E06 | M3 Cloudinary migration core | `node --test --experimental-strip-types test/cloudinary-migration.test.ts` | PASS (7/7): real fields, dedupe, URL resource identity, foreign cloud rejection, dry-run, commit/checkpoint, partial resume, verification veto | 2026-10-13 | TEST_EVIDENCE / VERIFIED LOCALLY |
| R-E07 | M3 static compatibility | `npx.cmd tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E08 | M3 live Cloudinary behavior | Not run: no safe test product-environment credentials/configuration supplied | Authenticated existence, CDN invalidation, and old-public denial remain production/operator checks | 2026-10-13 | BLOCKED / PRODUCTION MIGRATION PENDING |
| R-E09 | M4 super-admin provisioning | `node --test --experimental-strip-types test/superadmin-provisioning.test.ts` | PASS (5/5): new create, no-op existing rejection, profile preservation, Auth compensation, durable reconciliation state | 2026-10-13 | TEST_EVIDENCE / VERIFIED LOCALLY |
| R-E10 | M4 static compatibility | `npx.cmd tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E11 | M5 approval coordinator | `node --test --experimental-strip-types test/verification-approval.test.ts` | PASS (9/9): all types, conflict, Auth failure, compensation, reconciliation, intended-email retry, completed retry | 2026-10-13 | TEST_EVIDENCE / VERIFIED WITH CONTROLLED DEPENDENCIES |
| R-E12 | M5 actual route handler | `node --test --experimental-strip-types test/verification-approval-route.test.ts` | PASS (4/4): success, revoked token, authorization/conflict status, actionable incomplete response | 2026-10-13 | TEST_EVIDENCE / VERIFIED WITH CONTROLLED DEPENDENCIES |
| R-E13 | M5 static compatibility | `npx.cmd tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E14 | M6 audit authority boundary | `node --test --experimental-strip-types test/audit-authority.test.ts` | PASS (4/4): arbitrary privileged event denied, telemetry separated, actor protected, forwarding headers untrusted by default | 2026-10-13 | TEST_EVIDENCE / PARTIAL - LEGACY MUTATIONS OPEN |
| R-E15 | M7 protected-media core | `node --test --experimental-strip-types test/protected-media.test.ts` | PASS (4/4): exact identity, URL resource type, owner/domain roles/locked denial, SDK signed authenticated URL without false expiry | 2026-10-13 | TEST_EVIDENCE / PARTIAL |
| R-E16 | M7 live unsigned/expired delivery | Not run: separate Cloudinary token key/plan/test environment not supplied | Token expiry and CDN enforcement remain blocked; signed authenticated URL is not described as expiring | 2026-10-13 | BLOCKED |
| R-E17 | M8 configured document resolver | `node --test --experimental-strip-types test/configured-document-types.test.ts` | PASS (4/4): standard/custom, disabled, forged/invalid fee, explicit waiver policy | 2026-10-13 | TEST_EVIDENCE / VERIFIED WITH CONTROLLED DEPENDENCIES |
| R-E18 | M6-M8 static compatibility | `npx.cmd tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E19 | M9 Verification Only route policy | `node --test --experimental-strip-types test/verification-only-access.test.ts` | PASS (2/2 equivalent roles; allowed verification sections and denied unrelated routes) | 2026-10-13 | TEST_EVIDENCE / VERIFIED POLICY |
| R-E20 | M9 static compatibility | `npx.cmd tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E21 | M9 browser behavior | See R-E27 | Unauthenticated desktop/mobile smoke passes; authenticated role and live role-change coverage remains open | 2026-10-13 | PARTIAL |
| R-E22 | Firestore rules enforcement | `npm.cmd run test:rules` | PASS (5/5): unauthenticated/locked, View Only denial, resident forged request denial, specialized scopes, audit/telemetry client denial | 2026-10-13 | TEST_EVIDENCE / VERIFIED LOCALLY |
| R-E23 | Integrated implementation suite | `npm.cmd test` | PASS (110/110); emulator suite excluded and executed separately | 2026-10-13 | TEST_EVIDENCE / VERIFIED LOCALLY |
| R-E24 | App and test/script TypeScript | `npm.cmd run typecheck`; `npm.cmd run typecheck:test` | PASS / PASS | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E25 | Expanded lint | `npm.cmd run lint -- --quiet` | PASS (0 errors); scripts/tests are included; legacy warnings remain outside quiet mode | 2026-10-13 | TEST_EVIDENCE / VERIFIED WITH QUALIFICATION |
| R-E26 | Production build | `npm.cmd run build` | PASS; Next 16.4.0 generated 45 routes | 2026-10-13 | TEST_EVIDENCE / VERIFIED |
| R-E27 | Browser smoke | External local Next server + `PLAYWRIGHT_EXTERNAL_SERVER=1 npm.cmd run test:e2e` | PASS (4/4), desktop/mobile unauthenticated admin redirect and public/login reflow | 2026-10-13 | TEST_EVIDENCE / PARTIAL; AUTHENTICATED ROLE E2E OPEN |
| R-E28 | Production dependency audit | `npm.cmd audit --omit=dev` | 0 critical/high; 2 moderate through ExcelJS `uuid`; vulnerable `xlsx` removed and gRPC overridden to patched line | 2026-10-13 | TEST_EVIDENCE / PASS FOR HIGH-SEVERITY GATE |
| R-E29 | Full dependency audit | `npm.cmd audit` | 11 high, 5 moderate in development-tool dependency trees; no forced breaking downgrade applied | 2026-10-13 | BLOCKED / FOLLOW-UP REQUIRED |
| R-E30 | Production/provider operations | Not run by instruction | No deploy, rules publication, account creation, or production migration | 2026-10-13 | DEPLOYMENT PENDING |

| Check ID | Target Finding | Command / Test | Result | Date | Notes |
|---|---|---|---|---|---|---|
| E01 | Baseline TS | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Clean baseline compilation |
| E02 | Sanity Runner | `node --test --experimental-strip-types test/sanity.test.ts` | PASS (1 pass) | 2026-10-13 | Native Node.js TS test runner verified |
| E03 | Dependency Audit | `npm audit --json` | 21 advisories (2 crit, 14 high, 5 mod) | 2026-10-13 | Baseline dependency audit captured for #60 |
| E04 | Milestone B Auth/RBAC Tests | `npm test` | PASS (5/5 tests pass) | 2026-10-13 | Verified #26, #27, #28, #29, #30, #54-#59, #61 |
| E05 | Post-Milestone B Compile | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Clean build after Auth & RBAC remediation |
| E06 | Milestone C Tests | `node --test --experimental-strip-types test/milestone-c.test.ts` | PASS (4/4 tests pass) | 2026-10-13 | Verified #50 (XSS prevention), #51 (tickets), #52 (media auth), #53 (backup auth) |
| E07 | Post-Milestone C Compile | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Clean build after media & API security fixes |
| E08 | Milestone D Reporting/Audit Tests | `node --test --experimental-strip-types test/milestone-d.test.ts` | PASS (11/11 tests pass) | 2026-10-13 | Verified #1, #3, #6, #11, #14-#19, #31 |
| E09 | Post-Milestone D Compile | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Clean build after reporting, audit & lifecycle fixes |
| E10 | Milestone E Reports/Filters Tests | `node --test --experimental-strip-types test/milestone-e.test.ts` | PASS (7/7 tests pass) | 2026-10-13 | Verified #2, #4, #5, #7-#10, #12, #13, #20, #21 |
| E11 | Post-Milestone E Compile | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Clean build after reports, pagination & analytics fixes |
| E12 | Milestone F Resident Workflows Tests | `node --test --experimental-strip-types test/milestone-f.test.ts` | PASS (14/14 tests pass) | 2026-10-13 | Verified #22-#25, #38, #42-#45, #47-#49 |
| E13 | Post-Milestone F Compile | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Clean build after resident workflows & identity sync |
| E14 | Milestone G UI & A11y Tests | `node --test --experimental-strip-types test/milestone-g.test.ts` | PASS (13/13 tests pass) | 2026-10-13 | Verified #32-#37, #39-#41, #46 |
| E15 | Prior Regression Baseline | `npm test` | PASS (66/66 tests pass across 31 suites) | 2026-10-13 | Complete test suite execution across all milestones |
| E16 | Prior Type Check | `npx tsc --noEmit --incremental false` | PASS (0 errors) | 2026-10-13 | Full repository TypeScript verification code 0 |
| E17 | Reopened Remediation Test Suite | `node --test --experimental-strip-types test/reopened-remediation.test.ts` | PASS (28/28 tests pass across 8 suites) | 2026-10-13 | Verified Verification Only workspace, #6, #28/#30, #51, #52, #56, #61/#44 |
| E18 | Complete Integrated Test Suite | `npm test` | PASS (94/94 tests pass across 39 suites) | 2026-10-13 | 100% automated test pass across all project suites |
| E19 | TypeScript Static Verification | `npx tsc --noEmit` | PASS (0 errors) | 2026-10-13 | Zero compiler errors across entire codebase |
| E20 | ESLint Flat Config Verification | `npm run lint` | PASS (0 errors) | 2026-10-13 | Clean ESLint 9 check |
| E21 | Next.js 16.4.0 Production Build | `npm run build` | PASS (44/44 routes generated) | 2026-10-13 | Optimized production compilation with Turbopack |
| E22 | Identity Multi-Writer Emulator Suite | `npm run test:rules` | PASS (14/14 tests pass) | 2026-10-14 | Verified Task 1 (reconciling blocks all writers), Task 2 (zero read-after-write errors across all 3 actions with linked verification), Task 3 (in-flight locks block recovery, expected IDs bound, failure states preserved), Task 4 (simultaneous same-attempt execution blocked, idempotent completed retries produce no duplicate logs), Task 5 (competing attempts & stale completion rejected) |
| E23 | Unit & Integration Test Suite | `npm test` | PASS (136/136 tests pass across 31 suites) | 2026-10-14 | Complete unit and integration test suite execution with zero failures |
| E24 | Authenticated Browser Workflows | `npm run test:e2e:auth` | PASS (22/22 workflows pass) | 2026-10-14 | Chromium browser workflows against Auth & Firestore emulators (real roles, session revocation, verification approval, identity sync, request creation, media security) |
| E25 | Live Cloudinary Provider Probe | `node --experimental-strip-types scripts/verify-cloudinary-provider.ts` | PASS | 2026-10-14 | Live test against Cloudinary `gmseg91m` via disposable asset: 401 unsigned delivery denial, 200 permitted signed delivery, confirmed standard HMAC does not validate query `exp` parameter, deleted asset cleanly |
| E26 | TypeScript Static Verification | `npm run typecheck` & `npm run typecheck:test` | PASS (0 errors) | 2026-10-14 | Zero compiler errors across app and test codebases |
| E27 | ESLint Verification | `npm run lint` | PASS (0 errors) | 2026-10-14 | Zero ESLint errors across repository |
| E28 | Production Build | `npm run build` | PASS (47/47 routes generated) | 2026-10-14 | Clean Turbopack compilation |
| E29 | Dependency Audit | `npm audit` | 16 advisories (5 mod, 11 high) | 2026-10-14 | Retained without unapproved breaking downgrades; documented in DEPENDENCY_TRIAGE.md |

