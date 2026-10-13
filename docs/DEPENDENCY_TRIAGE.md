# TALASYS Dependency Security Triage (#60)

Date: 2026-10-13

## Current result

`npm audit --omit=dev` reports zero critical/high advisories and two moderate
advisories. The full `npm audit` reports 11 high and 5 moderate advisories in
development-tool dependency trees. Finding #60 is therefore production-clear
for the high-severity gate, but not blanket-closed for the full toolchain.

## Changes made

- Next.js is locked on 16.4.0 and the production build passes.
- `xlsx@0.18.5` was removed. Its only active use, server-side backup workbook
  generation, now uses `exceljs@4.4.0`.
- `@grpc/grpc-js` is overridden to the patched `^1.14.6` line so Firebase's
  browser Firestore dependency does not retain the vulnerable 1.9.x copy.
- No `npm audit fix --force` was run. The proposed changes include breaking
  downgrades and are not accepted without compatibility validation.

## Residual advisories

- Production: ExcelJS carries `uuid <11.1.1`, producing two moderate entries.
  npm proposes a breaking ExcelJS downgrade rather than a safe patch.
- Development: Firebase CLI transitively carries vulnerable `basic-ftp` and
  related proxy packages; Firebase CLI and ESLint/fast-glob trees also carry
  current `braces` advisories. These tools are not shipped in the production
  Next runtime, but the full-audit failure remains tracked.
- Firebase CLI also warns that `superstatic@10` supports Node 20/22/24, while
  the verification host used Node 26.11.1. The emulator suite nevertheless
  passed; CI should use a supported Node LTS version.

## Evidence

- `npm audit --omit=dev`: 2 moderate, 0 high, 0 critical.
- `npm audit`: 5 moderate, 11 high.
- `npm run build`: pass, 45 routes.
- `npm test`: pass, 110/110.

Re-run both audits before merge because advisory data and dependency releases
change independently of this repository.
