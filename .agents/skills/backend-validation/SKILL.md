---
name: backend-validation
description: >-
  Never trust the client. Rule set for strict backend validation.
---

# Input Validation & Sanitization

> **Category**: Backend & APIs
> **Tags**: Validation, Security, Zod

## Policy

```
Rule: Strict Input Validation
Description: All data entering the system must be rigorously checked.
1. Schema Validation: Parse all incoming request bodies, queries, and params against a strict schema (like Zod or Joi).
2. Strip unknown fields: Automatically strip or reject any JSON fields that are not defined in the schema to prevent mass-assignment attacks.
3. Type coercion: Coerce URL parameters (strings) to standard types (numbers, booleans) during validation, not inside the controller logic.
4. Sanitize strings: Escape all HTML characters in user input if it will ever be displayed back in a browser.
5. Limit payload size: Enforce a strict max size on incoming JSON payloads to prevent memory exhaustion denial of service.
```
