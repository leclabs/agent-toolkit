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

### 3. Update Task

Call `TaskUpdate` with new metadata:

```json
{
  "taskId": "1",
  "description": "{response.orchestratorInstructions}",
  "metadata": {
    "currentStep": "{response.metadata.currentStep}",
    "retryCount": "{response.metadata.retryCount}"
  },
  "status": "in_progress"
}
```

For terminal steps, set appropriate status:

- `terminal: "success"` → `status: "completed"`
- `terminal: "hitl"` → `status: "pending"`

### 4. Show Result

**Normal advancement:**

```
Advanced: #1 Task title ✨ (@flow:Reviewer)
 → feature-development · verification
 → code_review · in_progress

Previous: implement → code_review
Next: Delegate to @flow:Reviewer, then advance again
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
Action: Review and fix manually, then `/flow:task-advance 1 passed`
```

## Status Mapping

| Terminal | Native Status | Meaning          |
| -------- | ------------- | ---------------- |
| -        | in_progress   | Work continues   |
| success  | completed     | Task done        |
| hitl     | pending       | Needs human help |

### Workflow Emoji Mapping

Append emoji after task subject based on workflowType:

| workflowType           | Emoji  |
| ---------------------- | ------ |
| `feature-development`  | ✨     |
| `bug-fix`              | 🐛     |
| `agile-task`           | 📋     |
| `context-optimization` | 🔧     |
| `quick-task`           | ⚡     |
| `ui-reconstruction`    | 🎨     |
| `test-coverage`        | 🧪     |
| (unknown/missing)      | (none) |
