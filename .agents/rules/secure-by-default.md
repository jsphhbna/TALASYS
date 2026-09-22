# Secure by Default

```
POLICY: Secure By Default
Version: 2.0 — Comprehensive

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. IMPLICIT DENY — Authorization Default
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every route, endpoint, and data access function starts from a posture of
"deny until proven authorized." Never expose data or mutate state until explicit
authorization logic passes.

BAD:
  if (user.role !== "admin") throw new Error("Forbidden")  // whitelist one role
  // forgot: guest, banned, unverified — all implicitly allowed

GOOD:
  const ALLOWED_ROLES = ["admin", "editor"] as const
  if (!ALLOWED_ROLES.includes(user.role)) {
    throw new ForbiddenError("Insufficient permissions")
  }

Server components and API routes: never return data before calling a session
check, even if "the route is not linked in the UI."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. DISTRUST ALL CLIENT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All data arriving from a client — request body, query params, path params,
cookies, headers — is untrusted until parsed through a strict schema validator.

Required stack: Zod (or equivalent) at every boundary.

BAD:
  const { email, role } = req.body   // no validation — attacker can pass role: "admin"

GOOD:
  const schema = z.object({
    email: z.string().email().max(254),
    name: z.string().min(1).max(100).trim(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

Never trust: shape, type, length, or range of any client-provided value.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. NO SECRETS IN CODE — EVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Never hardcode or suggest hardcoding:
  - API keys
  - JWT signing secrets
  - Database connection strings
  - Service account credentials
  - Encryption keys or salts
  - Webhook verification tokens

Always reference environment variables:
  BAD: const client = new Stripe("sk_live_Abc123...")
  GOOD: const client = new Stripe(process.env.STRIPE_SECRET_KEY!)

In Next.js: prefix with NEXT_PUBLIC_ only for values safe to expose to browsers.
All server secrets must never be prefixed with NEXT_PUBLIC_.

Generate .env.example alongside any new service integration — document required
keys with placeholder values so onboarding does not require tribal knowledge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. FAIL CLOSED — Abort on Auth Uncertainty
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If an upstream auth check, session validation, or authorization call fails
unexpectedly, abort the entire request. Do not fall through to "allow anyway
to keep things working."

BAD:
  try {
    const session = await getSession()
    if (session?.user) { /* protect */ }
    // implicit: no session = still proceeds 🚨
  } catch { /* swallowed */ }

GOOD:
  const session = await getSession()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  // Only reaches here if session is valid

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. INJECTION PREVENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SQL: Never use string interpolation in queries.
  BAD: db.query("SELECT * FROM users WHERE id = " + userId)
  GOOD: db.query("SELECT * FROM users WHERE id = $1", [userId])

Command injection: Never pass user input to exec(), spawn(), or eval().
  BAD: exec("convert " + req.body.filename)
  GOOD: Validate filename against a strict allowlist regex before any shell use.

XSS: Never set innerHTML / dangerouslySetInnerHTML with unsanitized user content.
  BAD: <div dangerouslySetInnerHTML={{ __html: userPost }} />
  GOOD: Use DOMPurify.sanitize(userPost) or a trusted markdown renderer.

Path traversal: Reject any file path containing "..", "~", or absolute segments.
  Validate: /^[a-zA-Z0-9_-.]+$/ before any file system access.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. DEPENDENCY HYGIENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Pin critical security dependencies (auth, crypto, DB) to exact versions
  - Flag any dependency that hasn't been updated in 12+ months in a security-critical path
  - Never suggest packages with known CVEs without flagging them explicitly
  - Run npm audit / pnpm audit and address High or Critical findings before release
```
