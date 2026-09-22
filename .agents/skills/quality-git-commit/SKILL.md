---
name: quality-git-commit
description: >-
  Writing atomic commits and descriptive commit messages.
---

# Git Commit Discipline

> **Category**: Code Quality & Refactoring
> **Tags**: Git, Version Control, Collaboration

## Policy

```
Rule: Clean Version History
Description: Commits are communication with your future team.
1. Conventional Commits: Prefix commits with standardized types (feat:, fix:, chore:, docs:, refactor:, test:, perf:). Example: "feat: add user profile picture upload".
2. Atomic Commits: Each commit must represent a single, logical change. Do not bundle a UI feature, a database migration, and a documentation typo fix into an "update stuff" commit.
3. The Body: If the "what" or "why" is complex, leave an empty line and write a detailed body paragraph within the commit message explaining the architectural decision.
4. Feature Branches: Keep branches scoped to a specific ticket. Rebase frequently against the main branch to prevent massive merge conflicts later.
5. Working State: Every commit in the main branch's history should compile and pass tests. Do not commit intentionally half-broken intermediate states into master.
```
