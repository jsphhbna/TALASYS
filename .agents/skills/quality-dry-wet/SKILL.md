---
name: quality-dry-wet
description: >-
  When to extract abstractions and when to leave duplication alone.
---

# DRY vs. WET Code

> **Category**: Code Quality & Refactoring
> **Tags**: Refactoring, Clean Code, Architecture

## Policy

```
Rule: Strategic Duplication
Description: Do Not Repeat Yourself, but Write Everything Twice initially.
1. The Rule of Three: Do not abstract duplicated code until you see it used identically in three different places. The first two times, just duplicate it.
2. Incidental vs Inherent Duplication: Just because two functions look identical currently doesn't mean they are the same concept. If they change for different business reasons, they must remain separate (e.g., an AdminUser and a CustomerUser record might currently look identical).
3. Premature Abstraction: A bad abstraction that forces you to add 15 IF statements to support different edge-cases is significantly worse than having three slightly duplicated functions.
4. Shared Config: "Magic Strings" and Numbers must always be DRY'd out into constants files immediately. Duplicating values is a bug waiting to happen.
5. Testing: The more you try to DRY out test setup blocks into generic helpers, the harder the tests are to read. Tests prefer explicit duplicated setup to maintain readability.
```
