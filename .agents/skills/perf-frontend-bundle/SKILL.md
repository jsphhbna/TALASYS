---
name: perf-frontend-bundle
description: >-
  Keeping the initial JavaScript payload small and fast.
---

# Frontend Bundle Optimization

> **Category**: Performance
> **Tags**: Webpack, Bundle, JavaScript

## Policy

```
Rule: Keep Client Bundles Small
Description: A bloated JavaScript bundle destroys Time-To-Interactive.
1. Code Splitting: Use dynamic imports for large, non-critical components, charting libraries, or components housed inside hidden tabs/modals.
2. Tree Shaking: Ensure you import from specific files (import { isDate } from 'date-fns/isDate') or use tools that support tree-shaking correctly so unused library code is dropped.
3. Library Audit: Avoid giant monolithic libraries (e.g., moment.js, lodash). Pick lightweight, modular alternatives (date-fns, native JS methods).
4. Analyze: Run bundle analyzers periodically to identify which dependencies are taking up the most space.
5. Image optimization: Do not ship unoptimized raw images. Serve WebP/AVIF formats, size them to the exact container width, and lazy-load below-the-fold images.
```
