---
name: mobile-performance
description: >-
  Preventing UI thread blocking and managing list rendering.
---

# Mobile App Performance Rules

> **Category**: Mobile Development
> **Tags**: Mobile, Performance, React Native

## Policy

```
Rule: Preserve 60fps on Mobile
Description: Mobile devices have constrained CPU power.
1. Offload the UI Thread: Never perform heavy parsing (large JSON), image processing, or decryption on the main UI/JavaScript thread. It will cause scrolling to stutter.
2. List Virtualization: Always use dedicated high-performance list components (FlatList, FlashList) rather than mapping arrays to ScrollViews. Implement pagination aggressively.
3. Image Optimization: Cache network images to disk, aggressively downscale heavy resolution images before displaying them on screen, and use fast formats like WebP.
4. Minimal layout passes: Deeply nested View components require expensive layout calculations during flexbox parsing. Flatten hierarchies where possible.
5. Memoize handlers: Prevent re-rendering complex list items by memoizing callback functions and ensuring reference stability.
```
