---
name: db-nosql
description: >-
  When to use Document databases and how to model data.
---

# NoSQL Design Principles

> **Category**: Database & Data
> **Tags**: NoSQL, MongoDB, DynamoDB

## Policy

```
Rule: NoSQL Data Modeling
Description: Model data based on how it is queried, not how it relates.
1. When to use: Use NoSQL for rapidly changing flexible schemas, massive scale KV tracking, IoT data, or complex nested JSON objects that don't query cleanly. Do not use for highly structured financial relations.
2. Denormalization: Duplicating data is normal. If displaying an Author name in a Post object, embed the author's name inside the Post document to avoid expensive join-like lookups.
3. Update management: Because data is duplicated, your application must handle updating all copies when the source data changes (e.g., updating the author's name on all their old posts).
4. Aggregate limits: Document databases usually have size limits per document (e.g., 16MB in Mongo). Do not embed arrays that grow infinitely (like all comments on an article); split them out.
5. Global Indexes: Understand the partition key and sort key structure (in DynamoDB) heavily before writing data. A bad choice will cause massive performance throttling.
```
