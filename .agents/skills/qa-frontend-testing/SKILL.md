---
name: qa-frontend-testing
description: >-
  Testing UI components with React Testing Library.
---

# Frontend Component Testing

> **Category**: Testing & QA
> **Tags**: Testing, RTL, React

## Policy

```
Rule: Test Like a User
Description: Interact with the UI as a user would.
1. RTL Philosophy: Use React Testing Library. Query elements by their accessible roles (getByRole('button', { name: /submit/i })) rather than by test-ids or CSS targets.
2. User interactions: Simulate clicks and typing using '@testing-library/user-event' rather than firing exact DOM events. It more accurately simulates browser behavior and focus events.
3. Mocking APIs: Intercept mock API calls at the network level using MSW (Mock Service Worker), rather than mocking the fetch fetch/axios functions globally.
4. Async assertions: Form submissions and API calls are async. Use 'await waitFor' or 'find...' queries to wait for the UI to update.
5. Visual regressions: UI tests shouldn't check if a margin is 10px. Use visual regression tools (Playwright/Percy) for stylistic tests.
```
