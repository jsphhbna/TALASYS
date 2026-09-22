---
name: quality-naming
description: >-
  Rules for producing highly readable, descriptive names.
---

# Variables and Function Naming

> **Category**: Code Quality & Refactoring
> **Tags**: Clean Code, Naming, Readability

## Policy

```
Rule: Intent-Revealing Naming
Description: Code is read 10x more than written. Make it clear.
1. Pronounceable / Searchable: Name variables clearly (e.g., maxLoginAttempts over mla). Avoid single-letter variables except for tiny iterator loops.
2. Action verbs for functions: Function names must start with a verb indicating their action (e.g., getUser, deleteOrder, calculateTax).
3. Boolean flags: Prefix booleans with is, has, can, or should. (e.g., isActive, hasPermission).
4. Collections: Treat arrays and sets as plural nouns (e.g., users, activeSubscriptions). Treat the singular item in maps as the singular noun.
5. Symmetrical pairs: Maintain consistency. (Open/Close, Start/Stop, Insert/Delete, Add/Remove, Fetch/Save).
```
