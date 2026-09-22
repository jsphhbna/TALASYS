---
name: mobile-os-integration
description: >-
  Requesting permissions and handling app lifecycles correctly.
---

# OS Integrations & Permissions

> **Category**: Mobile Development
> **Tags**: Mobile, UX, OS

## Policy

```
Rule: Native OS Respect
Description: Apps must behave like first-class citizens of iOS and Android.
1. Just-in-Time Permissions: Never ask for Location, Contacts, or Camera access on app launch. Ask only exactly as the user taps the feature that requires it, providing a contextual explanation.
2. App State Lifecycle: Handle the application moving to the background. Pause active audio/video, halt aggressive network polling, and blur sensitive screens.
3. Deep Linking: Support Universal Links/App Links from day one so emails and web referrals open cleanly inside the app at the specific routed screen.
4. Haptic Feedback: Add subtle, native haptic ticks for important interactions (success checks, destructive warnings, pull-to-refresh).
5. Safe Area Insets: Ensure layouts dynamically shift to respect the notch, dynamic island, and bottom home-bar indicators specifically for the exact rendering device.
```
