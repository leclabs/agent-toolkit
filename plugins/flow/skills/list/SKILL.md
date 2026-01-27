---
description: List available workflows loaded in Navigator.
---

# /flow:list

Show all workflows currently loaded in Navigator.

## What To Do

### 1. Get Workflow List

Call `Navigator.ListWorkflows` to get loaded workflows (data only, no dialog):

```json
{
  "workflows": [
    {
      "id": "feature-development",
      "name": "Feature Development",
      "description": "End-to-end workflow for building features",
      "stepCount": 14
    },
    {
      "id": "bug-fix",
      "name": "Bug Fix",
      "description": "Bug investigation and fix workflow",
      "stepCount": 8
    }
  ]
}
```

### 2. Display Results

Format as a table:

```markdown
## Available Workflows

| ID                  | Name                | Description                               | steps |
| ------------------- | ------------------- | ----------------------------------------- | ----- |
| feature-development | Feature Development | End-to-end workflow for building features | 14    |
| bug-fix             | Bug Fix             | Bug investigation and fix workflow        | 8     |
| agile-task          | Agile Task          | Simple task workflow                      | 5     |

Use `/flow:diagram <id>` to visualize a workflow or `/flow:task-create <description> --workflow <id>` to create a task.
```

## If No Workflows Loaded

```
No workflows loaded.

Run /flow:init to set up workflows for this project.
```
