---
name: backend-error-handling
description: >-
  Catching and formatting errors systematically without leaking internals.
---

# Centralized Error Handling

> **Category**: Backend & APIs
> **Tags**: Errors, Middleware, Stability

## Policy

```
Rule: Systemic Error Handling
Description: Handle failures gracefully and predictably.
1. Throw custom errors: Create specific error classes (e.g., NotFoundError, ValidationError) that carry HTTP status codes to be caught by a global handler.
2. Global catch-all: Use a centralized error-handling middleware to catch uncaught exceptions. Never let a request hang or crash the server process.
3. Do not leak stacks: In production, the generic error handler must never return stack traces or internal DB error strings to the client.
4. Log appropriately: Log 5xx errors as high severity. Do not log 404s or 400s as application crashes, but do record them for analytics.
5. Async boundaries: Ensure promises are awaited or properly caught. An unhandled promise rejection is a process restart.
```
