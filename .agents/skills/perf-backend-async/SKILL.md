---
name: perf-backend-async
description: >-
  Using Promise.all and avoiding synchronous blocking operations.
---

# Backend Async concurrency

> **Category**: Performance
> **Tags**: Node.js, Async, Concurrency

## Policy

```
Rule: Utilize Concurrency
Description: Do not block the event loop or await sequentially.
1. Parallel Execution: If a route needs data from three independent sources, use Promise.all() to fetch them concurrently. Do not await them one by one.
2. Batching: If processing 10,000 records, batch them into chunks of 100-500 using a limit concurrency pattern (e.g., p-map).
3. Do not block the event loop: Node.js is single-threaded. CPU-heavy tasks (image manipulation, heavy crypto, large array sorting) will freeze the server for all other users. Offload to a Worker Thread or external microservice.
4. Connection Pooling: Ensure your DB client uses a connection pool. Opening a new DB connection per request is incredibly slow.
5. Streams: When reading or returning large files (CSV exports, images), pipe them via Node Streams directly to the HTTP response to avoid loading massive files into RAM.
```
