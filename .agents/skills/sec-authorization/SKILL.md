---
name: sec-authorization
description: >-
  Role-based access control and enforcing permissions securely.
---

# RBAC and Authorization

> **Category**: Security & Auth
> **Tags**: Security, Authorization, RBAC

## Policy

```
Rule: Enforce Strict Authorization
Description: Authentication is 'who you are'. Authorization is 'what you can do'.
1. Default Deny: All sensitive routes and endpoints must require authorization by default. Only explicitly whitelist public routes.
2. Server-side checks: Never rely on hiding a UI button for security. The backend endpoint MUST verify the user has the required role/permission to perform the action.
3. Resource ownership: Even if a user has the 'Editor' role, verify they are the 'Owner' or have tenant-access to the specific resource ID they are trying to modify (e.g., article ID).
4. Granular permissions: Prefer checking for specific permissions (can_delete_post) rather than broad roles (is_admin).
5. Audit logging: Log authorization failures. A sudden spike in 403 errors usually indicates a scanning attack or a broken UI.
```
