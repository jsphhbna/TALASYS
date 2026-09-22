---
name: devops-ci-cd
description: >-
  Automating tests, linting, and safe cloud deployments.
---

# CI/CD Pipeline Design

> **Category**: DevOps & Deployment
> **Tags**: CI/CD, Actions, Automation

## Policy

```
Rule: Zero-touch Deployment Pipelines
Description: Code goes to production via automation, never manually.
1. Build once: Compile the application and build the artifact / Docker image exactly once. Push it to a registry. Use that identical artifact in Staging, and then promote it to Production.
2. Testing gates: The CI pipeline must run the linter, type-checker, and unit test suite. If any fail, the pipeline blocks the merge and blocks deployment.
3. Fast feedback: CI pipelines should complete in under 5 minutes. Cache dependencies and build output (e.g., actions/cache in GitHub Actions) to speed this up.
4. Secrets injection: Inject deployment secrets (AWS keys, DB passwords) into the pipeline environment via your CI provider's secure secret manager.
5. Rollbacks: The CD pipeline must support instant rollback to the previous version tag if a critical production alarm goes off.
```
