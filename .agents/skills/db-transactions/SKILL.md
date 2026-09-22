---
name: db-transactions
description: >-
  Ensuring multi-step writes succeed or fail together.
---

# Transaction Integrity

> **Category**: Database & Data
> **Tags**: Database, Transactions, ACID

## Policy

```
Rule: Use Database Transactions
Description: Prevent partial data corruption.
1. Scope: Any business operation that requires modifying (INSERT/UPDATE/DELETE) more than one table must be wrapped in a transaction block. Example: Creating an Order and deducting Inventory.
2. Rollback: Ensure errors inside the block trigger a rollback.
3. External calls: Avoid making slow external HTTP calls (like calling Stripe API) while holding an open database transaction lock. Reserve transactions purely for fast, internal DB data manipulation.
4. Isolation Levels: Understand default isolation levels. If you need strictly sequential reading and writing of accounts (e.g., transferring money), investigate locking rows (SELECT FOR UPDATE) to prevent race conditions.
5. ORM implementation: When using an ORM like Prisma or TypeORM, ensure the nested transactional context object is passed to all subsequent database calls within the block.
```
