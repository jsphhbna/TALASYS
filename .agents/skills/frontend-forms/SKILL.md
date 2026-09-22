---
name: frontend-forms
description: >-
  Building robust, user-friendly forms with validation.
---

# Form Handling Rules

> **Category**: Frontend Development
> **Tags**: Forms, Zod, Validation

## Policy

```
Rule: Robust Form Implementation
Description: Forms must handle validation, submission, and feedback correctly.
1. Library: Use React Hook Form (or similar) to manage form state natively without uncontrolled re-renders.
2. Validation: Define the form schema using Zod or Yup. Share this schema with the backend if possible.
3. Inline errors: Show validation errors inline, directly below the offending input field.
4. Submitting state: Disable the primary submit button and show a spinner while the form is submitting to prevent double posts.
5. Dirty states: Warn the user if they try to navigate away with unsaved changes in a complex form.
```
