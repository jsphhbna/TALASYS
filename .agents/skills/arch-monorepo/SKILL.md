---
name: arch-monorepo
description: >-
  Managing multiple packages and apps in a single repository.
---

# Monorepo Structure Rules

> **Category**: Architecture & Patterns
> **Tags**: Monorepo, Turborepo, Workspaces

## Policy

```
Rule: Maintainable Monorepos
Description: Organizing workspaces cleanly using Turborepo or Nx.
1. App vs Packages: Separate executable applications (Next.js, Express) into an 'apps/' folder, and shared libraries (ui, config, utils) into a 'packages/' folder.
2. Explicit Dependencies: If App A uses Package B, declare it explicitly in package.json. Never rely on relative imports reaching outside the project root.
3. Shared Configs: Extract ESLint, Prettier, TypeScript, and Tailwind configurations into dedicated packages and extend them in the apps.
4. Build Orchestration: Use a task runner (Turborepo) to cache builds and run parallel tests. Ensure inputs and outputs for caching are correctly configured.
5. Version Sync: Keep external dependencies (like React version) synchronized across the entire monorepo to prevent bundle duplication.
```
