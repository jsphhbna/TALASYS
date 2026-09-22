---
name: qa-e2e-testing
description: >-
  Writing Cypress or Playwright tests for critical user flows.
---

# End-to-End (E2E) Testing

> **Category**: Testing & QA
> **Tags**: E2E, Playwright, Cypress

## Policy

```
Rule: Automate the Golden Paths
Description: Ensure the most critical workflows never break.
1. Identify critical flows: E2E is slow and brittle. Only use it for the "Golden Paths": Login, Checkout, Onboarding, Creating the core entity.
2. Resilient selectors: Use dedicated 'data-testid' attributes for E2E tests to prevent tests breaking every time a designer changes a CSS class.
3. Test Data isolated: Create dedicated test user accounts and clean them up. Do not run E2E scripts against live production data if it manipulates state.
4. Flakiness: Handle async timing diligently. Wait for specific API requests to resolve, or for specific elements to appear, before progressing to the next click. Do NOT use hard-coded 'sleep(2000)' waits.
5. CI execution: Run E2E tests automatically on main branches and pre-deployment gates to catch total system regressions.
```
