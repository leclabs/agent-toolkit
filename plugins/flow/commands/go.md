---
description: Execute all pending flow tasks autonomously
argument-hint: [task]
---

Execute all pending flow tasks in the queue autonomously.

- `{task}`: Start from a specific task

## Options

- No args: Run all pending tasks in order
- `{task}`: Start from a specific task

## Instructions

1. Call `TaskList` to get all tasks
2. Filter for pending flow tasks (have `metadata.workflowType`, not blocked)
3. Sort by ID (lowest first)
4. For each task: execute `/flow:run {taskId} --autonomy`
5. Continue until queue empty or task fails/needs HITL

Report progress after each task completes.
