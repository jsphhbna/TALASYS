---
name: arch-repository-pattern
description: >-
  Abstracting database access behind a clean domain interface.
---

# Repository Pattern

> **Category**: Architecture & Patterns
> **Tags**: Database, Architecture, Abstraction

## Policy

```
Rule: Use Repositories for Data Access
Description: Isolate the ORM or SQL logic from business rules.
1. Define an interface: Create a 'UserRepository' that has methods like 'findById' or 'save'.
2. Internalize the ORM: The specific Prisma, TypeORM, or SQL queries live inside the repository. The rest of the app does not know which DB library is used.
3. Return Domain Objects: Repositories should ideally transform raw DB rows into clean domain objects or types.
4. Testing: This allows business logic services to be tested by passing an in-memory mock repository.
5. Centralized Queries: Prevents duplicating the same complex SQL join across ten different controller files.
```
