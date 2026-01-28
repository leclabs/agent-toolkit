---
description: List available workflows loaded in Navigator.
---

# /flow:list

Show workflows currently loaded in Navigator.

## Usage

```
/flow:list              # Show project workflows (or all if no project workflows)
/flow:list --catalog    # Include catalog workflows
/flow:list --all        # Show all workflows (project + catalog)
```

## What To Do

### 1. Get Workflow List

Call `Navigator.ListWorkflows` with source filter:

- Default (no flag): Let Navigator decide (project-only if project workflows exist)
- `--catalog`: `source: "catalog"`
- `--all`: `source: "all"`

Response includes:

```json
{
  "workflows": [
    {
      "id": "feature-development",
      "name": "Feature Development",
      "description": "End-to-end workflow for building features",
      "stepCount": 14,
      "source": "project"
    }
  ],
  "filter": "project",
  "hasProjectWorkflows": true,
  "hint": "Showing project workflows. Use source='all' to include catalog."
}
```

### 2. Display Results

Format as a table with source indicator:

```markdown
## Workflows (project)

| ID                  | Name                | Description                               | Steps |
| ------------------- | ------------------- | ----------------------------------------- | ----- |
| feature-development | Feature Development | End-to-end workflow for building features | 14    |
| custom-deploy       | Custom Deploy       | Project-specific deployment               | 6     |

Use `/flow:list --all` to include catalog workflows.
```

**If showing all sources**, group by source:

```markdown
## Project Workflows

| ID                  | Name                | Steps |
| ------------------- | ------------------- | ----- |
| feature-development | Feature Development | 14    |

## Catalog Workflows

| ID         | Name       | Steps |
| ---------- | ---------- | ----- |
| quick-task | Quick Task | 5     |
| bug-fix    | Bug Fix    | 8     |
```

### 3. Footer

Always show helpful next steps:

```
Use `/flow:diagram <id>` to visualize a workflow.
Use `/flow:task-create <description> <id>` to create a task.
```

## If No Workflows Loaded

```
No workflows loaded.

Run /flow:init to set up workflows for this project.
```
