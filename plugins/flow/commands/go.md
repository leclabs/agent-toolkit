---
description: Execute all pending flow tasks autonomously
argument-hint: [task]
---

If `--help` is in the arguments, display the following usage guide and stop:

```
/flow:go [task]

Execute all pending flow tasks in the queue autonomously.

Arguments:
  task    Optional task ID to start from

Examples:
  /flow:go          Run all pending tasks in order
  /flow:go 3        Start from task 3
```

---

Execute all pending flow tasks in the queue autonomously.

- `{task}`: Start from a specific task

## Instructions

1. Call `TaskList` to get all tasks
2. Filter for pending flow tasks (have `metadata.workflowType`, not blocked)
3. Sort by ID (lowest first)
4. For each task, execute using the loop protocol below with `autonomy: true`
5. Continue until queue empty or task fails/needs HITL

Report progress after each task completes.

!`cat "${CLAUDE_PLUGIN_ROOT}/instructions/execution-loop.md"`
