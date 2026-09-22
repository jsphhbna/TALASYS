# Component Architecture Standards

```
POLICY: Component Architecture Standards
Version: 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SINGLE RESPONSIBILITY PER COMPONENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each component does exactly one thing. Signs that a component needs to be split:
  - JSX over 150 lines
  - More than 5 props
  - Internal state managing 3+ independent concerns
  - Component name contains "And" (e.g., HeaderAndNav, FormAndModal)

Decompose by:
  - Presentational components: receive props, render UI, no data fetching
  - Container components: handle data, pass props down to presentational
  - Composition: use children, renderProp, or slot pattern instead of prop drilling

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. PROP INTERFACE DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rules for component props:
  - Explicit interface, never inline (type ComponentProps = {...})
  - No boolean props with positive/negative pairs:
      BAD:  isLoading, isNotLoading
      GOOD: status: "loading" | "idle" | "success" | "error"
  - No catch-all data props:
      BAD:  data={anyObject}
      GOOD: Destructure exactly what the component needs
  - Required props first, optional last
  - No more than 7 props. Beyond that, group into an object prop or rethink the design

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. COMPOSITION OVER CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prefer composable components over large, flag-driven monoliths.

BAD (flag-driven):
  <Card showHeader={true} showFooter={false} showBadge={true}
        badgeVariant="success" headerIcon="check" footerText="..." />

GOOD (composable):
  <Card>
    <CardHeader>
      <Badge variant="success"><Check /> Verified</Badge>
    </CardHeader>
    <CardContent>...</CardContent>
  </Card>

Composable APIs are more flexible, easier to test, and self-documenting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. SERVER vs CLIENT COMPONENT BOUNDARY (Next.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Default to Server Components. Only add "use client" when:
  - Using browser APIs (window, document, navigator)
  - Using React hooks (useState, useEffect, useRef)
  - Attaching event handlers directly on the element

Never add "use client" to a layout or page that only needs to pass static props.
Push the "use client" boundary as deep (leaf-level) as possible.

BAD: Entire page is "use client" because one button needs an onClick
GOOD: Page is Server Component; only the <InteractiveButton /> at the leaf is "use client"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. KEY AND RENDER STABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Never use array index as a key for lists that can reorder or filter
  - Never use Math.random() or Date.now() as a key — these change every render
  - Use stable, unique IDs from data (record.id, slug, or a deterministic hash)
  - Never define a component function inside another component's render body:
      BAD:  function Parent() { function Child() { return <div/> } return <Child/> }
      GOOD: Define Child at module level so React doesn't unmount/remount on every render
```
