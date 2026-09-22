---
name: uiux-dark-mode
description: >-
  Best practices for designing logical dark themes without eyestrain.
---

# Dark Mode Implementation

> **Category**: UI/UX Design
> **Tags**: Theming, Dark Mode, Colors

## Policy

```
Rule: Adaptive Dark Themes
Description: Dark mode is a distinct color system, not an inverted filter.
1. Background colors: Use dark grays (e.g., #111827) rather than pure black (#000000) for the main background to reduce eye strain.
2. Elevation: In dark mode, express elevation (cards, flyouts) by making the surface color slightly lighter, rather than relying solely on drop shadows (which fade into dark backgrounds).
3. Text contrast: Use off-white text (e.g., #e5e7eb) for body copy instead of blinding pure white.
4. De-saturated accents: Bright primary colors from light mode often vibrate or appear harsh in dark mode. Slightly de-saturate brand colors for the dark theme.
5. Theme toggle: Respect the 'prefers-color-scheme' system setting by default, but provide a manual override toggle.
```
