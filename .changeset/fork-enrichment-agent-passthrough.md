---
"@leclabs/agent-toolkit": minor
---

Enrich fork responses with per-branch step info and make agent IDs pass-through

- Fork responses now include enriched per-branch data (subagent, stepInstructions, orchestratorInstructions, multiStep flag, metadata) so the orchestrator can create child tasks without extra Navigate calls
- Fork-with-result advancement: passing a result on a fork node automatically advances through the join to the post-join step
- Agent IDs are now passed through exactly as specified in workflow definitions — the navigator no longer rewrites agent names, enabling project-specific and external plugin agents (e.g. `ipsum:Copywriter`) to work without modification
- Catalog workflows now use explicit `flow:AgentName` references
- Added emoji field to workflow schema for visual agent indicators in diagrams
- New workflows: context-gather, execute
- Extracted writeThrough helper to consolidate task-file persistence logic
