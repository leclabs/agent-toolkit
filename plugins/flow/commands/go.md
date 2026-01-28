---
description: Execute all pending flow tasks autonomously
argument-hint: [--from taskId]
---

Execute all pending flow tasks in the queue autonomously.

## Options

- No args: Run all pending tasks in ID order
- `--from <taskId>`: Start from a specific task ID

## Instructions

1. Call `TaskList` to get all tasks
2. Filter for pending flow tasks (have `metadata.workflowType`, not blocked)
3. Sort by ID (lowest first)
4. For each task: execute `/flow:run {taskId}`
5. Continue until queue empty or task fails/needs HITL

If `--from` specified, skip tasks with ID less than the given taskId.

Report progress after each task completes.
