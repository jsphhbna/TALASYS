---
name: sec-data-protection
description: >-
  Protecting passwords and sensitive data at rest and in transit.
---

# Data Encryption & Hashing

> **Category**: Security & Auth
> **Tags**: Cryptography, Security, Passwords

## Policy

```
Rule: Protect Sensitive Data
Description: Ensure data cannot be read if the database is compromised.
1. Hashing Passwords: Never store plain text passwords. Use bcrypt or Argon2 with an appropriate salt/cost factor. Never roll your own crypto.
2. In transit: Enforce strict TLS/HTTPS for all connections. Disallow downgrade attacks via HSTS headers.
3. Sensitive data at rest: Encrypt highly sensitive PII (SSNs, medical records) at the application layer before writing to the database.
4. Secrets management: Never commit API keys or database URIs to source control. Load them via environment variables or a secret vault.
5. Masking: Mask sensitive fields (credit cards, phone numbers) before returning them to the client or writing them to application logs.
```
