---
name: backend-background-jobs
description: >-
  Offloading slow processes to message queues or workers.
---

# Background Job Architecture

> **Category**: Backend & APIs
> **Tags**: Workers, Queues, Async

## Policy

```
Rule: Background Processing
Description: Keep HTTP responses fast by deferring heavy work.
1. Offload heavy tasks: Any operation taking more than 500ms (sending emails, processing images, heavy exports) must be pushed to a queue.
2. Job idempotency: Job handlers must be idempotent. If a background job is retried, it must not corrupt data (e.g., sending the same email twice).
3. Dead letter queues: Jobs that fail permanently after retries must be moved to a dead letter queue for manual inspection.
4. Polling vs Webhooks: If a client needs to know when a job finishes, provide a polling endpoint or a webhook rather than holding the HTTP connection open.
5. Distinct infrastructure: Run background workers in a separate process or container from the main web server.
```
