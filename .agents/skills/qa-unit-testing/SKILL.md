---
name: qa-unit-testing
description: >-
  Writing effective, isolated tests for pure functions and components.
---

# Unit Testing Fundamentals

> **Category**: Testing & QA
> **Tags**: Testing, Jest, Vitest

## Policy

```
Rule: Write Meaningful Unit Tests
Description: Test logic, not implementation details.
1. Pure functions first: The highest ROI for unit tests is complex business logic functions, parsers, and calculators.
2. AAA Pattern: Structure tests clearly. Arrange (setup data), Act (call function), Assert (check result).
3. Test edge cases: Do not just test the happy path. Test nulls, empty arrays, out-of-bounds numbers, and expected errors.
4. Mock boundaries: Mock network calls and database access in unit tests. The test should run entirely in memory in milliseconds.
5. Avoid brittleness: Test the output of a function based on specific inputs. Do not assert that 'internalFunctionX was called 3 times' unless testing a specific side-effect router.
```
