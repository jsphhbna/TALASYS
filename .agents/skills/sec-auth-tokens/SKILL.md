---
name: sec-auth-tokens
description: >-
  Secure storage and transmission of authentication tokens.
---

# JWT and Session Security

> **Category**: Security & Auth
> **Tags**: Security, JWT, Auth

## Policy

```
Rule: Secure Authentication Handling
Description: Protect user identities from theft.
1. Storage: Never store access tokens or refresh tokens in LocalStorage or SessionStorage (vulnerable to XSS).
2. HttpOnly Cookies: Store auth tokens in secure, HttpOnly, SameSite=Lax (or Strict) cookies.
3. Short-lived tokens: JWT access tokens should expire quickly (e.g., 15 minutes). Use a refresh token rotation system for persistent sessions.
4. Verification: Always verify the signature, expiration date, and audience of a JWT on the server for every protected route.
5. Logout: Invalidate the session on the server-side, clear the secure cookie, and revoke the refresh token in the database upon logout.
```
