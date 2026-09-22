# Performance-First Development

```
POLICY: Performance-First Development
Version: 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. MEMOIZATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use memoization when: the computation is expensive OR the value is used as
a dependency in useEffect / passed as a prop to a memoized child.

  useMemo: Cache expensive derived values
    GOOD: const sorted = useMemo(() => items.sort(compareFn), [items])
    BAD:  const label = useMemo(() => "Hello " + name, [name])  // too cheap, unnecessary

  useCallback: Cache event handler references passed to child components
    GOOD: const handleClick = useCallback(() => { ... }, [deps])
    BAD:  const handleClick = useCallback(() => setCount(c => c + 1), [])
          // setCount is stable — useCallback adds noise here

  React.memo: Wrap pure components receiving complex props
    GOOD: export const Card = React.memo(({ item }: Props) => { ... })
    BAD:  Wrapping every component without profiling first

Do not memoize by default. Memoize when you have evidence of a problem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. AVOID EXPENSIVE OPERATIONS IN RENDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Forbidden in the render body (outside useMemo):
  - Array.sort() on large lists (sort mutates — always sort a copy: [...arr].sort())
  - JSON.parse() or JSON.stringify() on large objects
  - new Date() or date formatting in loops
  - Regular expression construction: new RegExp(pattern) — create once, use many times
  - DOM queries (document.querySelector) — use refs

BAD:
  function Component({ items }) {
    const sorted = items.sort((a, b) => a.name.localeCompare(b.name)) // runs every render

GOOD:
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  )

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. IMAGE OPTIMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Always use next/image, never <img> in Next.js
  - Always specify width and height (or fill + a sized parent container)
  - Use priority={true} only for above-the-fold images
  - Use appropriate formats: WebP for photos, SVG for icons/logos
  - Never embed large base64 images inline in JSX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. BUNDLE SIZE DISCIPLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Never import an entire library to use one function:
      BAD:  import _ from "lodash"
      GOOD: import debounce from "lodash/debounce"
  - Use dynamic imports for heavy components not needed on first paint:
      GOOD: const Chart = dynamic(() => import("./Chart"), { ssr: false })
  - Audit bundle with @next/bundle-analyzer before each release
  - Flag any single dependency adding more than 50kB to client bundle

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. AVOID STATE THAT CAUSES WATERFALL RENDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Never trigger a fetch inside useEffect that depends on the result of another fetch
    inside a different useEffect. Compose fetch logic in parallel.
  - Use React Query, SWR, or server-side data loading to eliminate client-side
    data waterfall patterns.
  - Colocate related state: multiple setState() calls that always fire together
    should be merged into a single state object or a useReducer.
```
