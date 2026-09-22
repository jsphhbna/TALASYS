---
name: perf-database-queries
description: >-
  Fixing N+1 queries, adding indexes, and avoiding full table scans.
---

# Database Query Optimization

> **Category**: Performance
> **Tags**: SQL, Indexes, ORM

## Policy

```
Rule: Fast Database Queries
Description: Database I/O is usually the main bottleneck.
1. N+1 Problem: Never run a database query inside a loop. Fetch all parent IDs, then do a single query 'WHERE parent_id IN (...)', and stitch the data in memory.
2. Indexing: Any column used frequently in 'WHERE', 'ORDER BY', or 'JOIN' clauses must be indexed. Use compound indexes for multi-column lookups.
3. Select Specific Columns: Do not run 'SELECT *'. Only fetch the columns required by the current business case to reduce network payload and memory.
4. Pagination: Use Keyset Pagination (Cursor pagination) rather than Offset pagination for massive tables to prevent deep-page slowdowns.
5. Query Profiling: Log and investigate any query taking longer than 100ms. Use EXPLAIN ANALYZE to understand the query plan.
```
