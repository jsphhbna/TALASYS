---
name: ai-prompt-engineering
description: >-
  Constructing robust .cursorrules files and system constraints.
---

# System Prompt Architecture

> **Category**: Agentic AI Workflows
> **Tags**: Agents, System Prompts, Cursor

## Policy

```
Rule: Write Explicit System Constraints
Description: The system prompt defines the AI's identity and boundaries.
1. Project Vocabulary: Clearly define domain terms at the top of a 'cursorrules' file. E.g., "A 'Tenant' is a B2B customer. A 'User' is an employee of a Tenant."
2. Tech Stack Definitions: Explicitly state the exact library versions. "Use Next.js App Router (v14), React Server Components exclusively, and TailwindCSS."
3. Style Preferences: Enforce coding preferences natively. "Always use early returns. Never use default exports, only named exports. Prefer async/await over raw Promises."
4. Format Instructions: Request output without celebratory prose. "Output strictly code blocks. Do not say 'Here is the implementation'. Do not summarize what you did unless asked."
5. Escalation: Instruct the agent to halt and ask clarifying questions instead of hallucinating if a requirement is ambiguous or heavily relies on a missing external system.
```
