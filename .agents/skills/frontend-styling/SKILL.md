---
name: frontend-styling
description: >-
  Maintainable styling using TailwindCSS or design systems.
---

# Styling and CSS Constraints

> **Category**: Frontend Development
> **Tags**: TailwindCSS, CSS, Design System

## Policy

```
Rule: Styling Constraints
Description: Enforce consistency in UI implementation.
1. Token scale: Only use spacing, color, and typography values from the defined design system or Tailwind config. No arbitrary values (e.g., text-[13px]) unless strictly necessary.
2. Group utilities: When using Tailwind, group classes logically (layout, spacing, typography, colors, interactive).
3. Dynamic classes: Use a utility like 'clsx' or 'tailwind-merge' to combine dynamic classes conditionally.
4. Scoped CSS: If writing custom CSS, use CSS Modules to prevent global scope bleed.
5. Responsive design: Always design mobile-first. Default classes apply to mobile, 'md:' or 'lg:' apply to larger screens.
```
