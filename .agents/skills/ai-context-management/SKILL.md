---
name: ai-context-management
description: >-
  Guiding the AI to synthesize only relevant files.
---

# Managing AI Context Windows

> **Category**: Agentic AI Workflows
> **Tags**: Agents, Prompting, Context

## Policy

```
Rule: Curate AI Context Carefully
Description: Avoid overwhelming the model's context window.
1. Targeted file selection: When giving an agent a task, explicitly link only the 3-5 files immediately relevant to the architecture. Dumping 40 files dilutes attention and reduces logic rigor.
2. Summarization scripts: For large repositories, provide the agent with a script (like an AST parser) that outputs just the function signatures/interfaces of a module, rather than the raw 1000-line implementation file.
3. Chunking logs: If an agent needs to debug logs, grep for errors and pipe a 50-line window around the error, rather than pasting a 10MB log file.
4. Isolate refactoring: Instruct the agent to strictly modify only the targeted functions. "Do not rewrite unrelated code in this file, even to apply standard formatting."
5. Persistent architecture docs: Maintain an 'ARCHITECTURE.md' file that heavily dictates standard patterns. Instruct the agent to read this first before planning any new feature.
```
