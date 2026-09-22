---
name: uiux-responsive-layouts
description: >-
  Rules for scaling interfaces seamlessly across devices.
---

# Responsive Breakpoint Logic

> **Category**: UI/UX Design
> **Tags**: Responsive, Mobile, Layout

## Policy

```
Rule: Mobile-First Responsive Design
Description: Ensure interfaces work flawlessly on all viewports.
1. Mobile-friendly defaults: Start by coding the layout for a 375px mobile screen. Add rules iteratively for tablets (md) and desktops (lg/xl).
2. Touch targets: Ensure any clickable element is at least 44x44px to accommodate human fingers on touch devices.
3. Content reflow: On small screens, side-by-side elements should stack vertically.
4. Hidden complexity: Hide secondary navigation or advanced filters behind a drawer or hamburger menu on mobile, but expose them on desktop.
5. Prevent horizontal scroll: Ensure all containers use 'max-w-full' and long text uses 'break-words' to prevent accidental horizontal scrolling.
```
