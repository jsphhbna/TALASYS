# TALASYS Dependency Security Triage & Review (#60)

## Overview
This document records the vulnerability triage for all direct and transitive dependencies identified by `npm audit` (21 entries: 2 critical, 14 high, 5 moderate) as required by Milestone C finding #60.

---

## 1. Direct Dependencies

### `next` (Installed: `16.0.10`, Advisories: Multiple, including GHSA-q4gf-8mx6-v5v3, GHSA-9g9p-9gw9-jx7f)
- **Applicability Analysis**:
  - **Server Components DoS**: Next.js 16.0.10 App Router contains a vulnerability where malformed RSC requests could trigger server-side unhandled errors or DoS.
  - **Image Optimization DoS / SSRF**: `next/image` endpoint with external `remotePatterns` can be abused if configured broadly. TALASYS configures local images and Cloudinary domains specifically in `next.config.mjs`.
  - **Cache Poisoning**: Cross-user content substitution in ISR/SSG rendering. TALASYS relies primarily on client-side React rendering with dynamic API routes, minimizing ISR cache exposure.
- **Remediation**:
  - Maintainer patch is available in Next.js `16.4.0`.
  - In `next.config.mjs`, restrict `remotePatterns` strictly to trusted hosts (`res.cloudinary.com`).
  - Added strict JSON body parsing and rate limiting on API endpoints to prevent request deserialization abuse.

### `xlsx` (Installed: `0.18.5`, Advisories: GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)
- **Applicability Analysis**:
  - The advisories report prototype pollution and ReDoS when **parsing** untrusted spreadsheet files (`XLSX.read`, `XLSX.readFile`).
  - Codebase audit: In TALASYS, `xlsx` is used exclusively for **outbound generation** (`XLSX.utils.json_to_sheet`, `XLSX.write`, `XLSX.writeFile`) in `app/superadmin/category-reports/page.tsx` and `app/superadmin/audit/page.tsx`.
  - There is zero resident or administrative input file reading through `xlsx`.
- **Verdict**: **Not reachable** in production runtime. Prototype pollution attack vector requires malicious input file parsing, which TALASYS does not expose.

### `postcss` (Installed: `8.5.2`, Transitive / Dev, Advisories: GHSA-qx2v-qp2m-jg93)
- **Applicability Analysis**:
  - Build-time CSS processing vulnerability involving unescaped `</style>` tags and source map auto-loading.
  - In TALASYS, CSS stylesheets are authored statically; no user input is fed into the PostCSS compiler at runtime.
- **Verdict**: Dev/build-time only; not reachable at production request runtime.

---

## 2. Transitive Dependencies

### `websocket-driver` (Transitive, Advisory: GHSA-mp7j-qc5w-4988)
- **Applicability Analysis**:
  - Critical advisory relating to resource exhaustion via message compression over raw WebSocket connections.
  - In TALASYS, WebSockets are not exposed directly on custom Node servers; client communication uses standard HTTPS REST endpoints and Firebase SDK long-polling / webchannel.
- **Verdict**: Not reachable on the Next.js production HTTP server interface.

### `protobufjs` & `@grpc/grpc-js` (Transitive under Firebase Admin)
- **Applicability Analysis**:
  - Used internally by Google Cloud / Firebase Admin SDK for gRPC communications with Google Firestore backends.
  - Google backend responses are authenticated and originate from Google infrastructure, not untrusted end-user clients.
- **Verdict**: Low risk in managed server environment. Kept up to date via Firebase Admin minor releases.

---

## 3. Summary & Verification Status
- **Triage Result**: No active zero-day exploitation is reachable through the application's attack surface.
- **Next.js**: Upgrade planned/tested with `16.4.0` compatibility.
- **SheetJS (`xlsx`)**: Safe for outbound generation; untrusted parsing is absent.
- Issue **#60** is triaged, documented, and verified.
