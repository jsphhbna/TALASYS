---
name: arch-event-driven
description: >-
  Using events to decouple side effects from main business logic.
---

# Event-Driven Architecture

> **Category**: Architecture & Patterns
> **Tags**: Events, PubSub, Decoupling

## Policy

```
Rule: Trigger Side Effects via Events
Description: Keep core logic clean by broadcasting events.
1. Emitters: When a significant domain action happens (e.g., UserRegistered), the service emits an event instead of directly calling the EmailService to send a welcome email.
2. Listeners: Isolated listeners subscribe to those events and perform side activities (sending emails, updating analytics, syncing to CRM).
3. Benefits: The core service doesn't need to import ten other services. Adding a new side effect just requires a new listener.
4. Async boundaries: Be deliberate about whether event handlers run synchronously in the same transaction, or asynchronously in a background queue.
5. Documentation: Document your event catalog clearly so developers know what triggers are available.
```
