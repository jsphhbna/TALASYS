---
name: quality-error-messages
description: >-
  Rules for creating helpful, actionable error responses.
---

# Writing Error Messages

> **Category**: Code Quality & Refactoring
> **Tags**: UX, Errors, Logs

## Policy

```
Rule: Action-Oriented Errors
Description: Error messages must help the user or developer recover.
1. Avoid generic jargon: "An unexpected error occurred" is useless. "Failed to connect to the database" is better. "Database connection timeout. Ensure VPN is active." is best.
2. State the cause and fix: Include WHAT happened, WHY it happened (if known), and HOW to resolve it (Action).
3. Include identifiers: For developer-facing error logs, always include the relevant ID (user_id, document_ID) that caused the failure to assist lookup.
4. Polite tone: Do not sound accusatory toward the user. Say "The username field is required" instead of "You forgot the username".
5. Provide context links: For complex configuration errors, provide a URL to the relevant internal documentation or wiki page.
```
