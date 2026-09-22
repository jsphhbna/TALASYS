---
name: sec-headers
description: >-
  Configuring Helmet or Next.js to set appropriate security headers.
---

# Secure HTTP Headers

> **Category**: Security & Auth
> **Tags**: Security, Headers, Helmet

## Policy

```
Rule: Configure Security Headers
Description: Harden the browser session via HTTP headers.
1. Content-Security-Policy (CSP): Define explicitly where scripts, fonts, and images can be loaded from to mitigate XSS impact.
2. X-Frame-Options: Set to 'DENY' or 'SAMEORIGIN' to prevent clickjacking attacks (embedding your site in an invisible iframe).
3. Strict-Transport-Security: Force browsers to connect over HTTPS only.
4. X-Content-Type-Options: Set to 'nosniff' to prevent browsers from misinterpreting a text file as an executable script.
5. Implementation: Use a library like 'helmet' in Express, or configure the Next.js/Nuxt config to automatically apply these headers to all responses.
```
