---
name: sec-owasp-basics
description: >-
  Guarding against common web vulnerabilities like XSS, CSRF, and SQLi.
---

# OWASP Top 10 Mitigation

> **Category**: Security & Auth
> **Tags**: OWASP, XSS, SQLi, CSRF

## Policy

```
Rule: Implement OWASP Defenses
Description: Block the most common attack vectors.
1. XSS (Cross-Site Scripting): Use modern frameworks (React) that auto-escape output. Only use 'dangerouslySetInnerHTML' after aggressive sanitization (DOMPurify).
2. SQLi (SQL Injection): Never concatenate user input into SQL strings. Always use parameterized queries or a trusted ORM.
3. CSRF (Cross-Site Request Forgery): Use anti-CSRF tokens for state-changing forms, or rely on strictly enforced SameSite=Lax cookie policies for API clients.
4. Parameter Tampering: Do not trust price or status fields sent from the client. Look up prices in the database based on item ID.
5. Rate Limiting: Apply strict rate limiting to login, password reset, and high-cost endpoints to prevent brute-forcing and scraping.
```
