---
name: frontend-data-fetching
description: >-
  Clean patterns for fetching, caching, and handling loading/error states in the browser.
---

# Data Fetching Standards

> **Category**: Frontend Development
> **Tags**: React Query, SWR, Fetching

## Policy

```
Rule: Data Fetching and Caching
Description: Never use raw 'useEffect' for data fetching.
1. Use a library: Always use React Query, SWR, or Apollo. They handle caching, deduping, and background updates.
2. Colocate hooks: Create custom hooks for queries (e.g., useUser(id)) rather than importing useQuery directly in the component.
3. Handle loading: Every data-dependent component must have a Skeleton or loading state.
4. Handle errors: Every query must have a defined error boundary or fallback UI.
5. Stale time: Define an explicit stale time for every query based on data volatility.
```
