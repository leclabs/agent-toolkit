---
description: Advance a task to the next workflow step based on pass/fail result.
---

# /flow:task-advance

Advance a task to the next workflow step based on pass/fail result.

## Usage

```
/flow:task-advance <taskId> <passed|failed> <navigator> ["summary"]
```

Where:

- `taskId`: The task to advance
- `result`: Either "passed" or "failed"
- `navigator`: JSON object with current navigator state from `metadata.navigator`
- `summary`: Optional description of work done or issues found

Example:

```
/flow:task-advance 1 passed {"workflowType":"quick-task","currentStep":"execute","retryCount":0} "Implementation complete"
```

## Why Navigator State is Required

The Skill tool creates an isolated execution context that cannot access native Claude Code tasks. The Orchestrator must pass the navigator state it already holds rather than fetching via TaskGet.

## What To Do

### 1. Advance with Navigate

Call `Navigator.Navigate` with minimal inputs:

```json
{
  "workflowType": "{navigator.workflowType}",
  "currentStep": "{navigator.currentStep}",
  "result": "passed|failed",
  "retryCount": "{navigator.retryCount}"
}
```

Navigate returns minimal output:

| Field | Purpose |
|-------|---------|
| `currentStep` | The new step after advancement |
| `stage` | Workflow stage (e.g., `"planning"`, `"development"`) |
| `subagent` | Who executes this step (e.g., `@flow:Developer`) |
| `stepInstructions` | `{name, description, guidance}` for delegation |
| `terminal` | `"success"` or `"hitl"` if workflow ended |
| `subjectSuffix` | `[workflow.stage.step]` for task subject |
| `action` | `"advance"`, `"retry"`, or `"escalate"` |
| `retriesIncremented` | `true` if this was a retry |

### 2. Update Task

Call `TaskUpdate` with the new state:

```json
{
  "taskId": "task-123",
  "subject": "{original title} {response.subjectSuffix}",
  "status": "in_progress",
  "metadata": {
    "navigator": {
      "workflowType": "{unchanged}",
      "currentStep": "{response.currentStep}",
      "retryCount": "{increment if retriesIncremented, else reset to 0}"
    }
  }
}
```

**Retry count logic:**
- If `retriesIncremented`: increment `retryCount`
- If advancing to new step: reset `retryCount` to 0

### 3. Show Result

**Normal advancement:**

```markdown
## Task Advanced

**Task:** task-123
**Subject:** Task title [feature-development.verification.code_review]
**Previous step:** implement
**Current step:** code_review
**Subagent:** @flow:Reviewer

### Next Action

Delegate to @flow:Reviewer, then advance again.
```

**Terminal - Success:**

```markdown
## Task Completed!

**Task:** task-123 reached successful completion.

The task has been marked as completed.
```

**Terminal - HITL:**

```markdown
## Task Needs Human Intervention

**Task:** task-123
**Reason:** Max retries exceeded

Human input required. Review the issue and either:

1. Make manual fixes, then run `/flow:task-advance task-123 passed`
2. Cancel/reassign the task
```

## Status Mapping

| Terminal | Native Status | Meaning          |
| -------- | ------------- | ---------------- |
| -        | in_progress   | Work continues   |
| success  | completed     | Task done        |
| hitl     | pending       | Needs human help |
