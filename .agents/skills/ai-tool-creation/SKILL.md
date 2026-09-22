---
name: ai-tool-creation
description: >-
  How to build custom CLI tools or endpoints for AI agents to consume.
---

# Designing Tools for Assistants

> **Category**: Agentic AI Workflows
> **Tags**: Agents, Tooling, MCP

## Policy

```
Rule: Build Agent-Friendly Tools
Description: Design tools that language models can easily interact with.
1. Strict JSON formats: Tools must accept and return predictable, well-structured JSON. Avoid returning raw text blobs that require regex parsing by the agent.
2. Clear instructions/descriptions: The tool's docstring/schema description is the physical prompt to the AI. Explicitly state what inputs it expects and exactly what the tool does in plain English.
3. Idempotent design: AI agents often retry tools if they fail or get confused. Action tools should ideally be idempotent (e.g., 'upsert' instead of naive 'append').
4. Fast feedback loops: If a tool runs a 3-minute command, the agent might time out or lose context. Provide background status polling mechanisms or stream small chunks back to the agent.
5. Self-documenting errors: If an AI feeds a tool bad data, the tool's error message must EXPLICITLY tell the AI what it did wrong and how to fix its query payload for the next attempt.
```
