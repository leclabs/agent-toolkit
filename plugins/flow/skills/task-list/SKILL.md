---
description: List flow tasks and their workflow progress. Use to find pending work, recover context after session breaks, or check task status.
---

# /flow:task-list

Display all tasks that have flow workflow tracking.

## What To Do

### 1. Get All Tasks

Call `TaskList` to get all native tasks.

### 2. Identify Flow Tasks

Decorate flow task title with metadata.navigator:

- **Suffix:** `[workflow.stage.step]`
- **Prefix:** `[extendedStatus]`

Examples:

- [start] Implement feature X [feature-dev.development.implement]
- [analyze] Fix login bug [bug-fix/investigation/reproduce]
- [in_progress] Quick fix [agile-task/development/implement]
- [HITL] Refactor auth [agile-task/review/review]

## Extract Navigator Info

From each task with `metadata.navigator`:

```javascript
const nav = task.metadata.navigator;
const info = {
  workflow: nav.workflowType,
  currentStep: nav.currentStep,
  subagent: nav.subagent, // e.g., "@flow:developer" or null
  stage: nav.stage,
  priority: nav.priority,
  status: nav.extendedStatus, // "HITL" or null
};
```
