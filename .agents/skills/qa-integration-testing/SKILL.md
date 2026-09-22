---
name: qa-integration-testing
description: >-
  Testing how the database, routing, and services work together.
---

# Integration and API Testing

> **Category**: Testing & QA
> **Tags**: Testing, Supertest, API

## Policy

```
Rule: API Integration Tests
Description: Ensure the system works as a whole entity.
1. Real Database: Integration tests should run against an actual database (often spun up via Docker/Testcontainers), NOT mocks.
2. End-to-end HTTP: Test the route by making a real HTTP request (e.g., via Supertest) and validating the JSON response and status code.
3. Seeding data: Write helper functions to quickly seed complex DB state before a test block.
4. Transaction rollback: Instead of resetting the database completely after every test, wrap tests in a DB transaction and roll it back, or truncate necessary tables rapidly.
5. Coverage: Ensure high coverage on complex database transactions and critical paths (auth, payment, main entity creation).
```
