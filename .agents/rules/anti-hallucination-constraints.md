# Anti-Hallucination Constraints

```
POLICY: Anti-Hallucination Enforcement
Version: 2.0 — Comprehensive

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. USE ONLY CONFIRMED APIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do not use a library method, prop, hook, or config key unless you are certain
it exists in the version present in the project.

Before using any library API, internally verify:
  a. Does this method exist in the MAJOR.MINOR version the project uses?
  b. Was this method added, deprecated, or renamed in a recent version?
  c. Does this method's signature match what I am about to write?

If any of the above cannot be confirmed with certainty: HALT.
State: "I am not certain this API exists in your version of [library].
Please verify in the docs or show me the package.json and I will check."

Never invent: optional props, hook arguments, callback signatures, config keys,
or error codes. If it is not known, it does not get written.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. VERSION AWARENESS REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before writing code that uses a library, check for known version-specific behavior:

React: Are we on React 18+ (concurrent features) or 17 (legacy root)?
       Is Suspense/Server Components available or are we in a pages-only setup?

Next.js: App Router (app/) or Pages Router (pages/)? Each has different conventions.
         Metadata API, Server Actions, and Route Handlers are App Router only.

Tailwind: v3 (JIT, arbitrary values) or v4 (CSS-first config)?
          v4 changed how theme() and @apply work.

Node.js: Are built-in ESM imports available or is CommonJS required?
         Does the runtime support top-level await?

If version is ambiguous, ask before writing version-specific code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. NO PHANTOM DEPENDENCIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Never write an import statement for a package not present in package.json.

If a package needs to be added:
  1. State: "This requires installing [package]. Run: pnpm add [package]"
  2. Provide the exact install command including any required peer dependencies
  3. Then write the implementation

Never silently assume a package is installed because it is a "common" package.
lodash, dayjs, zod, uuid — none of these can be imported without verification.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. DEPRECATION AND MODERN PATTERN AWARENESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actively avoid patterns that are deprecated in the project's ecosystem:

React:
  DEPRECATED: Class components, componentDidMount, componentWillUnmount
  MODERN: Function components + hooks
  DEPRECATED: ReactDOM.render()
  MODERN: createRoot().render()

Next.js:
  DEPRECATED: getInitialProps on most pages
  MODERN: getServerSideProps / getStaticProps / App Router data patterns
  DEPRECATED: <Head> from next/head in App Router
  MODERN: export const metadata = {} or generateMetadata()

CSS:
  DEPRECATED: float-based layout for page structure
  MODERN: CSS Grid / Flexbox
  DEPRECATED: vendor-prefixed properties written manually
  MODERN: Use PostCSS autoprefixer in the build pipeline

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. KNOWLEDGE CUTOFF TRANSPARENCY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When generating code for a library or framework that may have released major
updates after the knowledge cutoff:
  - Flag the uncertainty: "My knowledge of [library] extends to version X.
    If you are on a newer version, verify the following before using..."
  - Provide the canonical documentation URL for the user to cross-check
  - Mark uncertain sections with inline comments: // VERIFY: check this API exists in your version
```
