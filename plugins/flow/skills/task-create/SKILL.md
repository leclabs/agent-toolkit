---
description: Create a flow task from a description. Infers or accepts a workflow type, creates a tracked task, and optionally auto-executes.
---

# /flow:task-create

Create a new flow task from issues, requirements, or descriptions.

<usage>

**Args:**

- `description` - task description
- `workflowType` - workflow type
- `--run` - autorun after creation

**Signature:** `/flow:task-create <description> [<workflowType>] [<stepId>] [--run]`

| Command                                                       | Description                                        |
| ------------------------------------------------------------- | -------------------------------------------------- |
| /flow:task-create                                             | Interactive multi-panel workflowType selection     |
| /flow:task-create "Make a cup of coffee"                      | Infer workflowType → create task                   |
| /flow:task-create "Make a cup of coffee" --run                | Infer workflowType → create task → execute         |
| /flow:task-create "Make a coffee machine" feature-development | Create task with feature-development workflowType  |
| /flow:task-create "Replace coffee filter" agile-task --run    | Create task with agile-task workflowType → execute |
| /flow:task-create "Fix auth" bug-fix write_fix                | Create task starting at write_fix step (mid-flow)  |
| /flow:task-create "Fix auth" bug-fix write_fix --run          | Mid-flow start → execute                           |

</usage>

!`cat "${CLAUDE_PLUGIN_ROOT}/instructions/task-create.md"`
