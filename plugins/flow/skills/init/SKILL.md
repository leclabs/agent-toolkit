---
description: Initialize flow workflows for a project. Select and copy workflows to .flow/workflows/.
---

# /flow:init

Set up flow workflow orchestration for this project.

## What To Do

### 1. Get Available Workflows

Call `Navigator.ListCatalog` to get workflows and selection options:

```json
{
  "workflows": [...],
  "selectionOptions": [
    {"label": "Feature Development (Recommended)", "description": "..."},
    {"label": "Bug Fix", "description": "..."},
    ...
  ]
}
```

### 2. Present Selection Dialog

Use `AskUserQuestion` with the `selectionOptions` from ListCatalog:

- Set `multiSelect: true` to allow multiple selections
- Pass `selectionOptions` directly as the `options` array
- Map user selections back to workflow IDs for CopyWorkflows

### 3. Copy Selected Workflows

Call `Navigator.CopyWorkflows` with the selected workflow IDs:

```json
{
  "workflowIds": ["feature-development", "bug-fix"]
}
```

This:

- Creates `.flow/workflows/` directory if needed
- Copies workflow JSON files from catalog
- Validates schema on copy
- Loads workflows into Navigator memory

### 4. Show Results

Display what was initialized:

```markdown
## Flow Initialized

**Workflows copied to `.flow/workflows/`:**

- feature-development - End-to-end feature building
- bug-fix - Bug investigation and fix

**Next Steps:**

1. Create a task: `/flow:task-create "description" [workflow] feature-development`
2. List tasks: `/flow:task-list`
3. Run workflow: `/flow:run`
```

## Directory Structure Created

```
.flow/
└── workflows/
    ├── README.md
    ├── feature-development/
    │   ├── workflow.json
    │   └── {step}.md
    ├── bug-fix/
    │   └── ...
    └── ...
```

## Important Notes

- Workflows in `.flow/workflows/` can be customized per project
- Navigator loads from `.flow/workflows/` first, falls back to catalog
- Use `/flow:load` to reload workflows after editing
- Use `/flow:list` to see currently loaded workflows
