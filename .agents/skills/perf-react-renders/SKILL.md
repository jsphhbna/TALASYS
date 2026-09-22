---
name: perf-react-renders
description: >-
  Preventing unnecessary re-renders using memo, useMemo, and useCallback.
---

# React Render Optimization

> **Category**: Performance
> **Tags**: React, Performance, Optimization

## Policy

```
Rule: Optimize React Renders Correctly
Description: Re-rendering is fast, but cascading large tree re-renders is slow.
1. State placement: The most effective optimization is moving state down. If a text input makes a giant parent component re-render on every keystroke, extract the input into its own component.
2. Value equivalence: Arrays, Objects, and Functions created inline change reference on every render. If passed as props to a child, they bypass React.memo.
3. useMemo / useCallback: Only use these hooks for computationally expensive calculations, or specifically to preserve reference stability for child props if the child is expensive. Do not blanket-wrap everything.
4. Virtualization: If rendering a list of 500+ items, use a virtualized list library (react-window) to only render the visible DOM nodes.
5. React Developer Tools: Use the Profiler tab and enable "Highlight updates when components render" to identify unnecessary re-renders visually.
```
