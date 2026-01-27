---
description: Load workflows from .flow/workflows/ directory into Navigator.
---

# /flow:load

Reload workflows from the project's `.flow/workflows/` directory.

## When To Use

- After editing workflow JSON files
- After adding new workflows manually
- To refresh Navigator's in-memory workflow cache

## What To Do

### 1. Check for Workflows

Verify `.flow/workflows/` exists and contains JSON files.

If not found:

```
No workflows found in .flow/workflows/
Run /flow:init to set up workflows for this project.
```

### 2. Load Workflows

Navigator automatically loads workflows on startup from:

1. `.flow/workflows/` (project-specific, preferred)
2. Catalog (fallback if no project workflows)

To force reload, restart the Navigator MCP server or call `Navigator.ListWorkflows` to verify loaded workflows.

### 3. Validate and Report

Call `Navigator.ListWorkflows` to show loaded workflows:

```markdown
## Loaded Workflows

| Workflow            | Name                | steps |
| ------------------- | ------------------- | ----- |
| feature-development | Feature Development | 14    |
| bug-fix             | Bug Fix             | 8     |
| agile-task          | Agile Task          | 5     |

Source: project (.flow/workflows/)
```

If any workflows failed validation:

```markdown
**Skipped (invalid schema):**

- custom-workflow.json: missing 'edges' array
```

## Schema Requirements

Each workflow must have:

- `nodes` object with node definitions
- `edges` array with edge definitions

Each node should have:

- `type`: "start", "work", "gate", or "end"
- `agent`: (optional) agent ID for this node
- `stage`, `step`: (optional) categorization
- `maxRetries`: (optional) retry limit for work nodes

Terminal nodes use:

- `type: "start"` for entry point
- `type: "end"` with `result: "success"` for successful completion
- `type: "end"` with `result: "blocked"` and `escalation: "hitl"` for human intervention

Each edge must have:

- `from`: source node ID
- `to`: target node ID
- `on`: (optional) "passed" or "failed"
- `label`: (optional) edge description
