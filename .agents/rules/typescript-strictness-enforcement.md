# TypeScript Strictness Enforcement

```
POLICY: TypeScript Strictness Enforcement
Version: 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ZERO TOLERANCE FOR 'any'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Never use the 'any' type. It disables the compiler for that value and every
downstream consumer that touches it.

BAD:  function process(data: any): any { ... }
GOOD: function process(data: ProcessInput): ProcessResult { ... }

If the shape is truly unknown (JSON from external API):
  Use 'unknown' and narrow via runtime checks or Zod parsing.
  GOOD:
    const raw: unknown = JSON.parse(response)
    const parsed = ResponseSchema.parse(raw) // throws if invalid

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. NO UNSAFE TYPE ASSERTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'as SomeType' casts are assertions, not conversions. They lie to the compiler.

BAD: const user = data as User  // no runtime guarantee
BAD: const el = document.getElementById("app") as HTMLDivElement

GOOD (narrow properly):
  if (data && typeof data === "object" && "id" in data) {
    const user = data as User  // now justified by runtime check
  }
GOOD (null check before cast):
  const el = document.getElementById("app")
  if (!(el instanceof HTMLDivElement)) throw new Error("Expected #app to be a div")

Use the 'satisfies' operator for literal type widening without losing specificity:
  const config = { color: "red", size: 12 } satisfies Partial<Config>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. STRICT NULL SAFETY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Treat every nullable value as suspicious until proven non-null.

Required tsconfig flags:
  "strict": true,             // enables all strict checks
  "strictNullChecks": true,   // T and T | null are different types
  "noUncheckedIndexedAccess": true  // array[i] returns T | undefined, not T

BAD: const name = user.profile.name.toUpperCase()  // chain bombs on null
GOOD:
  const name = user?.profile?.name?.toUpperCase() ?? "Anonymous"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. DISCRIMINATED UNIONS FOR COMPLEX STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Never model multi-state data with separate booleans that can contradict each other.

BAD:
  { isLoading: boolean, isError: boolean, data: Data | null, error: Error | null }
  // What does isLoading=true AND isError=true mean? Contradictory.

GOOD (discriminated union):
  type State =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: Data }
    | { status: "error"; error: Error }

Only valid states are representable. The compiler enforces exhaustive handling.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. GENERICS OVER DUPLICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If the same structural pattern appears for 2+ types, extract a generic.

BAD:
  type UserResponse = { data: User; loading: boolean; error: string | null }
  type PostResponse = { data: Post; loading: boolean; error: string | null }

GOOD:
  type AsyncState<T> = { data: T | null; loading: boolean; error: string | null }
  type UserState = AsyncState<User>
  type PostState = AsyncState<Post>
```
