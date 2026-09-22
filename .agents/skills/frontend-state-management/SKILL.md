---
name: frontend-state-management
description: >-
  When to use local state, context, or global stores like Zustand/Redux.
---

# State Management Rules

> **Category**: Frontend Development
> **Tags**: React, State, Zustand

## Policy

```
Rule: State Management
Description: Ensure state lives at the correct level of the component tree.
1. Local state (useState): Use for purely UI state (dropdown open/closed, form input).
2. Lifted state: Use when siblings need to share state. Lift to the closest common ancestor.
3. Context: Use for state that is 'global' to a subtree but doesn't change often (theme, auth user). Do NOT use for high-frequency updates.
4. Global Store (Zustand/Redux): Use for complex, app-wide state that changes frequently or needs to be accessed outside the React tree.
5. URL State: Use search parameters for filter, sort, and pagination so pages are shareable.
```
