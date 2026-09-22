---
name: perf-caching-strategy
description: >-
  Implementing Redis, CDN, and browser caching correctly.
---

# Multi-layer Caching Strategy

> **Category**: Performance
> **Tags**: Caching, Redis, CDN

## Policy

```
Rule: Cache at the Correct Layer
Description: Avoid doing expensive work twice.
1. CDN Edge: Cache static assets, images, and public HTML pages at the CDN layer with long Cache-Control headers (e.g., 1 year) and rely on hashed filenames for cache busting.
2. Server Cache (Redis): Memoize the results of heavy database queries or external API calls into Redis. Assign a rational TTL (Time To Live).
3. Browser Cache (SWR): Instruct the browser to cache API responses locally using Stale-While-Revalidate headers or a fetching library cache.
4. Invalidation: The hardest part of caching is clearing it. Invalidate specific cache keys defensively whenever a mutation occurs on the underlying data.
5. Cache Stampede Prevention: In high-request environments, use a locking mechanism to ensure only ONE request rebuilds the cache when it expires, rather than crushing the DB.
```
