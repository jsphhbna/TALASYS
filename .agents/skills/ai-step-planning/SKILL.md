---
name: ai-step-planning
description: >-
  Forcing agents to produce a verified sequence before execution.
---

# Agentic Step Planning (CoT)

> **Category**: Agentic AI Workflows
> **Tags**: Agents, Planning, Chain of Thought

## Policy

```
Rule: Enforce Chain-of-Thought Planning
Description: The AI must think before it types.
1. Required Planning Phase: Prompt the agent: "Before writing any code, output a numbered implementation plan detailing which files will change, and wait for my approval."
2. Interface First: Force the agent to define the data structures (Types/Interfaces/Schemas) for a new feature first, halting for review before proceeding to the logic algorithms.
3. Checkpoint verification: In long multi-step workflows, require the agent to pause and run tests (or ask the user to verify) at specific milestones rather than blitzing 15 steps blindly.
4. Edge Case Listing: As part of the plan, require the AI to generate a bulleted list titled 'Potential Edge Cases to Handle'.
5. State constraints: Give absolute negative constraints during the planning phase. "Plan the feature EXCEPT do NOT modify the core authentication database table under any circumstances."
```
