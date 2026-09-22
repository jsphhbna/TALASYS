---
name: frontend-accessibility
description: >-
  Mandatory accessibility checks for web applications.
---

# Accessibility (a11y) Requirements

> **Category**: Frontend Development
> **Tags**: Accessibility, ARIA, a11y

## Policy

```
Rule: Accessibility Standards
Description: The UI must be usable by everyone.
1. Semantic HTML: Use <nav>, <main>, <article>, <header> instead of nested <div>s.
2. Keyboard navigation: Every interactive element must be reachable via 'Tab' and triggerable via 'Enter'/'Space'. The focus ring must be clearly visible.
3. ARIA labels: Icon-only buttons must have an 'aria-label'. Complex custom widgets must implement appropriate ARIA roles and states.
4. Color contrast: Text must meet WCAG AA contrast ratios (4.5:1 for normal text).
5. Alt text: All functional images must have descriptive 'alt' attributes. Decorative images must have empty 'alt=""'.
```
