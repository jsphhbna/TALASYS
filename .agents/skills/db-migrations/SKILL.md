---
name: db-migrations
description: >-
  Managing schema changes safely across environments.
---

# Database Migration Discipline

> **Category**: Database & Data
> **Tags**: Database, Migrations, DevOps

## Policy

```
Rule: Safe Database Migrations
Description: Treat database changes like code.
1. Source Control: Schema changes must be written as sequential migration files (SQL or ORM scripts) and committed to Git. Never modify the production database structure via a GUI.
2. Backwards compatibility: Dropping columns or renaming tables causes zero-downtime deployments to fail (old code crashes against new schema). Deprecate first, drop in a later release.
3. Locking: Adding an index to a 10 GB table can lock the whole table for minutes, taking down the app. Use 'CREATE INDEX CONCURRENTLY' in Postgres.
4. Automated runs: Run pending migrations automatically as a step in the CI/CD pipeline before traffic shifts to the new code.
5. Data Patches: If a migration requires converting data formats for millions of rows, write a background job script, do not lock the table in a single massive UPDATE migration.
```
