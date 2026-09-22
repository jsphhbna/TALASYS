---
name: db-schema-design
description: >-
  Rules for normalizing data, constraints, and relationships.
---

# Relational Schema Design

> **Category**: Database & Data
> **Tags**: Database, SQL, Schema

## Policy

```
Rule: Design Bulletproof Schemas
Description: The database protects data integrity.
1. Primary Keys: Use UUIDv7 or CUIDs instead of sequential auto-incrementing integers to prevent ID-guessing attacks and ease database merging.
2. Foreign Keys: Always define explicit foreign key constraints. Do not rely entirely on the application code to maintain relational integrity.
3. Not Null: Prefer 'NOT NULL' for columns by default. Only allow NULLs if the absence of a value has a specific semantic meaning.
4. Unique Indexes: Enforce business rules at the DB level. If an email must be unique, add a UNIQUE constraint to the database column.
5. Soft Deletes: Avoid actually deleting data. Add a 'deleted_at' timestamp column instead. This allows data recovery and preserves historical audit trails.
```
