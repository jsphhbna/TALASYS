---
name: devops-docker
description: >-
  Writing secure, minimal, cache-optimized Dockerfiles.
---

# Docker Best Practices

> **Category**: DevOps & Deployment
> **Tags**: Docker, DevOps, Containers

## Policy

```
Rule: Optimized Container Images
Description: Make builds fast, small, and secure.
1. Base image: Use specific, minimal tags (e.g., node:18-alpine) rather than large 'latest' tags to reduce attack surface and download time.
2. Multistage builds: Compile TS code or dependencies in a 'builder' stage, and copy only the final assets into a slim 'production' stage. Never ship source code or devDependencies in the prod image.
3. Layer caching: Copy package.json and run 'npm install' as a distinct step BEFORE copying the rest of the application code. This caches the slow 'install' step if dependencies haven't changed.
4. Non-root user: By default Docker runs as root. Explicitly declare a non-root user (USER node) at the end of the Dockerfile to mitigate container breakout attacks.
5. Env variables: Do not hardcode secret keys or API credentials directly in the Dockerfile using ENV. Inject them at runtime via orchestration systems (K8s/Compose).
```
