---
name: mobile-offline
description: >-
  Architecting apps that work in tunnels, airplanes, and bad networks.
---

# Offline-First Data Synchronization

> **Category**: Mobile Development
> **Tags**: Mobile, Offline, Architecture

## Policy

```
Rule: Graceful Network Degradation
Description: Treat network connectivity as a luxury, not a guarantee.
1. Local Database First: Read lists and data payloads exclusively from a local on-device DB (SQLite, WatermelonDB). Fetch from the network asynchronously to update the local DB.
2. Optimistic Updates: When a user performs an action (likes a post, completes a task), update the UI immediately and enqueue a background task to sync the change to the server.
3. Retry Queues: Failed mutations due to network loss must be placed in a persistent queue. The app must transparently retry them when a strong connection is restored.
4. Network State Banners: Subtly inform the user if they are viewing stale data because they are offline, but do not block navigation entirely.
5. Conflict Resolution: Design a strategy (Last Write Wins, or Server Authority) for reconciling data if the client mutates an object offline while the server mutated it independently.
```
