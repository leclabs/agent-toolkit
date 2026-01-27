# Agent Toolkit Project Memory

## Flow Orchestration

**IMPORTANT:** Invoke the `/flow:prime` skill at session start.

## Greenfield Project - No Backward Compatibility

This is a **greenfield project**. Do NOT:

- Add backward compatibility shims
- Support legacy formats alongside new ones
- Preserve old APIs when refactoring
- Add fallback code paths for deprecated patterns

When making breaking changes, just make them. Delete old code, don't wrap it.

## Architecture: Source vs Generated

This project follows a clear separation between **source templates** and **generated client configurations**:

```
SOURCE (Catalog/Plugin)              →  GENERATED (Project/.flow/)
─────────────────────────────────      ─────────────────────────────
plugins/flow/                          .flow/
  ├── workflows/*.json
```

### Key Principles

1. **Catalog JSON = portable templates** (source of truth)
   - Flow's catalog of workflows, `plugins/flow/catalog/`

2. **Dogfooding context**
   - We're using the flow plugin to develop the flow plugin
   - `plugins/flow/` and `packages/agent-flow-navigator-mcp/` = source we're building

## Naming Hierarchy

```
agent-toolkit (marketplace)
└── flow (plugin)
    └── navigator (mcp)
```

| Component              | Name                                | Purpose                          |
| ---------------------- | ----------------------------------- | -------------------------------- |
| Marketplace            | `agent-toolkit`                     | Collection of agent tools        |
| Plugin                 | `flow`                              | DAG-based workflow orchestration |
| MCP Server flow config | `navigator`                         | Navigates through workflow DAGs  |
| MCP Server npm Package | `@leclabs/agent-flow-navigator-mcp` | Publishable MCP package          |
| Skills                 | `/flow:*`                           | User-facing commands             |
