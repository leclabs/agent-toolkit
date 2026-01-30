---
description: Advance a task to the next workflow step based on pass/fail result.
---

# /flow:task-advance

Advance a task to the next workflow step based on pass/fail result.

## Usage

```
/flow:task-advance <taskId> <passed|failed> ["summary"]
```

Where:

- `taskId`: The task to advance
- `result`: Either "passed" or "failed"
- `summary`: Optional description of work done or issues found

Example:

```
/flow:task-advance 1 passed "Implementation complete"
```

## Task Directory

Use `$CLAUDE_CODE_TASK_LIST_ID` if set, otherwise fall back to session ID:

```
~/.claude/tasks/${CLAUDE_CODE_TASK_LIST_ID:-${CLAUDE_SESSION_ID}}/
```

## What To Do

### 1. Construct Task File Path

Build the task file path from taskId:

```javascript
const taskDir = process.env.CLAUDE_CODE_TASK_LIST_ID || "${CLAUDE_SESSION_ID}";
const taskFilePath = `~/.claude/tasks/${taskDir}/${taskId}.json`;
```

### 2. Advance with Navigate

Call `Navigator.Navigate` with taskFilePath and result:

```json
{
  "taskFilePath": "~/.claude/tasks/${taskDir}/1.json",
  "result": "passed"
}
```

Navigate reads the task file, extracts workflow state from metadata, and returns:

| Field                      | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `currentStep`              | The new step after advancement                              |
| `stage`                    | Workflow stage (e.g., `"planning"`, `"development"`)        |
| `subagent`                 | Who executes this step (e.g., `@flow:Developer`)            |
| `stepInstructions`         | `{name, description, guidance}` for delegation              |
| `terminal`                 | `"success"` or `"hitl"` if workflow ended                   |
| `orchestratorInstructions` | Updated task description                                    |
| `metadata`                 | `{ workflowType, currentStep, retryCount }` for task update |
| `action`                   | `"advance"`, `"retry"`, or `"escalate"`                     |
| `retriesIncremented`       | `true` if this was a retry                                  |

### 3. Update Task Status

Navigator's write-through has already updated the task file with `subject`, `activeForm`, `description`, and `metadata`. The skill only needs to sync the task status via `TaskUpdate`:

```json
{
  "taskId": "1",
  "status": "in_progress"
}
```

For terminal steps, set appropriate status:

- `terminal: "success"` → `status: "completed"`
- `terminal: "hitl"` → `status: "pending"`

### 4. Show Result

**Normal advancement** (task node, no retries display):

```
Advanced: #1 Task title ✨ (@flow:Reviewer)
 → feature-development · verification
 → code_review · in_progress

Previous: implement → code_review
Next: Delegate to @flow:Reviewer, then advance again
```

**Advancement to gate** (show retry budget when `maxRetries > 0`):

```
Advanced: #1 Task title ✨ (@flow:Reviewer)
 → feature-development · verification
 → code_review · in_progress · retries: 0/2

Previous: implement → code_review
Next: Delegate to @flow:Reviewer, then advance again
```

**Retry** (retryCount incremented):

```
Retrying: #1 Task title ✨ (@flow:Developer)
 → feature-development · development
 → implement · in_progress · retries: 2/3

Previous: code_review (failed) → implement
Next: Delegate to @flow:Developer, then advance again
```

**Terminal - Success:**

```
Completed: #1 Task title ✨
 → feature-development · end
 → end_success · completed ✓
```

**Terminal - HITL:**

```
⚠ HITL: #1 Task title ✨ (direct)
 → feature-development · verification
 → hitl_review · pending

Reason: Max retries exceeded
Action: Review and fix manually, then `/flow:task-advance {taskId} passed`
```

## Status Mapping

| Terminal | Native Status | Meaning          |
| -------- | ------------- | ---------------- |
| -        | in_progress   | Work continues   |
| success  | completed     | Task done        |
| hitl     | pending       | Needs human help |

