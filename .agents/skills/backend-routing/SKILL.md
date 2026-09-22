---
name: backend-routing
description: >-
  Decoupling HTTP transport logic from business logic.
---

# Router and Controller Separation

> **Category**: Backend & APIs
> **Tags**: Architecture, Controllers, Routing

## Policy

```
Rule: Separation of Transport and Logic
Description: Controllers handle HTTP; Services handle business rules.
1. Skinny Controllers: The controller/router layer should only extract the request data, invoke a service, and format the HTTP response.
2. Fat Services: Business logic lives in service functions. Services must not know about 'req' or 'res' objects.
3. Reusability: A service function should be callable from an HTTP controller, a background worker, or a CLI script interchangeably.
4. Middleware: Use middleware exclusively for cross-cutting concerns: auth, logging, rate limiting, and generic error handling.
5. Route definitions: Group routes by resource domain, not by HTTP method.
```
