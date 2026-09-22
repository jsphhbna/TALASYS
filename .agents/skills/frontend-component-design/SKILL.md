---
name: frontend-component-design
description: >-
  Rules for designing self-contained, composable React components.
---

# Component Design Patterns

> **Category**: Frontend Development
> **Tags**: React, Components, Architecture

## Policy

```
Rule: Component Design Guidelines
Description: Follow these constraints when building React components.
1. Single Responsibility: A component must do exactly one thing. If it fetches data, and renders a complex layout, split it.
2. Controlled vs Uncontrolled: Prefer controlled components for forms spanning multiple inputs.
3. Pure Components: Components that only rely on props should be pure functions.
4. Composition over configuration: Accept 'children' or slot props instead of fifty boolean flags to control rendering variations.
5. Max length: A component file must not exceed 250 lines. If it does, extract subcomponents.
```
