---
name: quality-commenting
description: >-
  Rules for writing comments that add value rather than clutter.
---

# Effective Commenting

> **Category**: Code Quality & Refactoring
> **Tags**: Documentation, Clean Code

## Policy

```
Rule: Comment the Why, not the What.
Description: Provide context that the code cannot express.
1. Expressiveness: The code itself should explain WHAT is happening via good variable naming. Only write a comment to explain WHY a decision was made.
2. Hacked Workarounds: If you had to write a strange, ugly piece of code to get around a specific browser bug or external API quirk, heavily document that quirk and link out to the relevant GitHub issue.
3. TODOs: Every 'TODO' comment MUST include a Jira ticket or tracking ID, or it will never be done.
4. DocStrings: Write JSDoc/DocStrings for complex utility functions outlining parameters, return types, and specific edge case behaviors, especially if used widely across the codebase.
5. Maintenance: Obsolete comments are worse than no comments. If you change a function's logic, update the comment.
```
