## Flow: Three Integration Layers

Flow has three distinct layers. Each owns different concerns.

### Flow (Navigator MCP)

Stateless workflow engine. Provides MCP tools for navigation, diagramming, and catalog management.

**Owns**: Workflow schema, catalog definitions, state machine logic, edge evaluation, fork/join, write-through persistence.

The `agent` field on workflow nodes is an opaque string to Flow — it stores and returns the value but doesn't resolve it. Flow can be consumed by any MCP client, not just Claude Code.

### Host Plugin

A Claude Code plugin that wraps Flow with an orchestration layer. Example: `plugins/flow/`.

**Owns**: Agent definitions, skills, commands, rules, hooks, delegation protocol.

Maps the `agent` string from workflow nodes to concrete agent definitions (e.g., `flow:Developer` → `agents/developer.md`). Different host plugins can wrap the same Navigator with different agent rosters and conventions.

### Host Project

The codebase where workflows execute. Uses Flow directly (MCP only) or via a host plugin.

**Owns**: `.flow/workflows/` customizations, project-level CLAUDE.md, the codebase itself.

Subagents operate on project code — the project provides execution context that neither Flow nor the plugin defines.

### Boundary Rules

- Flow must not assume host plugin conventions (no Claude Code concepts in Navigator)
- Host plugins must not embed project-specific context (portable across projects)
- The `agent` field is a contract between catalog and host plugin, opaque to Flow
- `.flow/` customizations override catalog defaults; catalog is the portable baseline
- Context flows downward: Flow provides schema → plugin provides orchestration → project provides codebase
