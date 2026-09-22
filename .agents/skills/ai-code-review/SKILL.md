---
name: ai-code-review
description: >-
  Prompts and techniques for self-auditing generated code.
---

# Agentic Code Review & Self-Correction

> **Category**: Agentic AI Workflows
> **Tags**: Agents, Review, Self-Correction

## Policy

```
Rule: Rigorous AI Self-Review
Description: AI is prone to subtle logic hallucinations. Enforce self-audits.
1. The Audit Prompt: After generation, prompt the agent: "Review the code above. Look specifically for unhandled async errors, null pointer exceptions, and memory leaks. Find at least one flaw."
2. Compile and Feedback: Instruct the agent to run the TypeScript compiler or specific test runner and ingest the pipeline errors directly. Do not act as the manual intermediary.
3. Security Lens: Add a specific security review step: "Assume the user input payload is malicious. Does the current validation stop a SQL injection or mass-assignment attack? Show your logic."
4. Check Against Requirements: Have the agent output a checklist of the original requirements and explicitly tick them off, matching lines of code to the requested feature.
5. Diff Review: When the agent proposes a large diff, ask it to summarize EXACTLY what existing functionality is being deleted or altered. "What legacy systems might subtly break from this change?"
```
