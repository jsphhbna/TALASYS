---
name: uiux-micro-interactions
description: >-
  Designing satisfying hover, focus, and loading states.
---

# State and Micro-interactions

> **Category**: UI/UX Design
> **Tags**: Animation, State, Feedback

## Policy

```
Rule: Interactive States
Description: The UI must clearly respond to user intent.
1. Explicit states: Every button and link must have defined 'hover', 'focus-visible', 'active' (pressed), and 'disabled' styles.
2. Focus indicators: Never remove focus outlines (outline: none) without providing an equally visible custom focus alternative. Keyboard users rely on them.
3. Immediate feedback: Clicking a button that triggers a network request must immediately disable the button and show an inline loading indicator.
4. Subtle transitions: Apply a 150ms-200ms ease transition to color and transform changes on interactive elements. Avoid jarring instantaneous flashes.
5. Smooth loading: Prefer skeleton screens over full-screen spinners for content blocks to reduce perceived wait time.
```
