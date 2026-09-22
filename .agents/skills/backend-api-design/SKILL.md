---
name: backend-api-design
description: >-
  Proper resource naming, status codes, and endpoint structure.
---

# REST/GraphQL API Design

> **Category**: Backend & APIs
> **Tags**: API, REST, Design

## Policy

```
Rule: API Endpoint Design
Description: Create predictable, standard-compliant APIs.
1. Resource-based URLs: Expose resources as nouns (/users, /orders). Never use verbs in REST paths (/getUsers is forbidden).
2. Status Codes: Return standard HTTP status codes. 200/201 for success, 400 for bad input, 401 unauthenticated, 403 unauthorized, 404 not found, 500 server error.
3. Versioning: Prefix APIs with a version (/api/v1/users) or require a version header.
4. Consistent envelope: Return errors in a consistent JSON shape (e.g., { error: { code, message, details } }).
5. Idempotency: PUT and DELETE endpoints must be idempotent. Repeating them must not change the end state.
```
