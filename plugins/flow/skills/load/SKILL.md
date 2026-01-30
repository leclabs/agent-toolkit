---
description: Load workflows into Navigator from project directory or external plugin path.
---

# /flow:load

Load workflows into Navigator. Reloads project workflows by default, or loads external plugin workflows when given a path.

## Usage

```
/flow:load                                    # Reload project workflows
/flow:load <path>                             # Load external workflows (sourceRoot = path)
/flow:load <path> --source-root <sourceRoot>  # Load external workflows with separate sourceRoot
```

**Arguments:**

- `path` (optional): Directory containing `{id}.json` workflow files. Omit to reload project workflows from `.flow/workflows/`.
- `--source-root` (optional): Root path for resolving `./` prefixed `context_files` entries. Defaults to `path` when loading external workflows, or the project root when reloading project workflows.

## When To Use

- After editing workflow JSON files in `.flow/workflows/`
- After adding new workflows manually
- To load workflows from an external plugin at session startup
- To refresh Navigator's in-memory workflow cache

## What To Do

### 1. Call LoadWorkflows

**Project workflows** (no path):

First, call `Navigator.LoadWorkflows` with no arguments to discover available workflows in `.flow/workflows/`.

If `.flow/workflows/` does not exist or has no workflows:

```
No workflows found in .flow/workflows/
Run /flow:init to set up workflows, or /flow:scaffold to create a custom one.
```

If workflows are available, present them to the user via `AskUserQuestion` and let them choose which to load. Then call `Navigator.LoadWorkflows` with the selected IDs:

```json
{
  "workflowIds": ["feature-development", "bug-fix"]
}
```

**External plugin** (path provided):

Call `Navigator.LoadWorkflows` with:

```json
{
  "path": "<path argument>",
  "sourceRoot": "<--source-root argument, or path if omitted>"
}
```

This loads `{id}.json` files from the directory, tags them as `source: "external"`, and stores the `sourceRoot` for resolving `./` prefixed `context_files` entries against the plugin's root rather than the project root.

### 2. Report Results

Call `Navigator.ListWorkflows` to show all loaded workflows:

```markdown
## Loaded Workflows

| Workflow            | Name                | Source   | Steps |
| ------------------- | ------------------- | -------- | ----- |
| feature-development | Feature Development | project  | 14    |
| fusion-cataloging   | Fusion Cataloging   | external | 10    |
| fusion-specifying   | Fusion Specifying   | external | 15    |

Sources: project (.flow/workflows/), external (<path>)
```

If any workflows failed validation:

```markdown
**Skipped (invalid schema):**

- custom-workflow.json: missing 'edges' array
```

## Context File Resolution

Workflow nodes can reference `context_files` — files the agent should read before executing a step.

- **Plain paths** (e.g., `ARCHITECTURE.md`) resolve against the project root
- **`./` prefixed paths** (e.g., `./skills/debug/SKILL.md`) resolve against the workflow's `sourceRoot`

This allows external plugins to ship workflows that reference their own skill files without knowing the project's directory structure.

## Schema Requirements

Each workflow must have:

- `nodes` object with node definitions
- `edges` array with edge definitions

Each node should have:

- `type`: "start", "task", "gate", or "end"
- `agent`: (optional) agent ID for this node
- `stage`: (optional) categorization
- `maxRetries`: (optional) retry limit
- `context_files`: (optional) files to load before executing

Terminal nodes use:

- `type: "start"` for entry point
- `type: "end"` with `result: "success"` for successful completion
- `type: "end"` with `result: "blocked"` and `escalation: "hitl"` for human intervention

Each edge must have:

- `from`: source node ID
- `to`: target node ID
- `on`: (optional) "passed" or "failed"
- `label`: (optional) edge description
