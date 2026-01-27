---
description: Execute flow tasks autonomously with subagent delegation. Primary command after task creation. Handles planning, implementation, testing, and review stages.
---

# /flow:run

Execute flow tasks autonomously, delegating to subagents based on `metadata.navigator.subagent`.

## Usage

```
/flow:run              # Execute highest priority pending task
/flow:run [taskId]     # Execute specific task
```

## What To Do

### 1. Get Task to Execute

**If taskId provided:**

- Call `TaskGet(taskId)` to get the task

**If no taskId:**

- Call `TaskList` and filter for flow tasks (those with `metadata.navigator`)
- Get highest priority pending task

### 2. The Execution Loop

WHILE task not at terminal, HITL, blocked, or interrupted step:

1. READ: Get subagent from Navigate response (or stored in metadata)
2. DELEGATE: If subagent set, use Task tool
3. EXECUTE: If no subagent, handle directly
4. ADVANCE: Call Navigator.Navigate with result
5. UPDATE: TaskUpdate with new metadata AND subjectSuffix
6. REPEAT: Continue until terminal or HITL

**Important:** Always update the task subject with `subjectSuffix` from Navigate response.

### 3. Delegation Protocol

**If subagent is set (e.g., `@flow:Developer`):**

Use the Task tool to delegate the step to the subagent.

Example:

```
Task(
  subagent_type: "flow:Developer",
  prompt: """
    Execute the '{stepName}' step for task {taskId}.

    ## Task
    {task title and description}

    ## Current Step
    {stepInstructions.name}: {stepInstructions.description}

    ## Guidance
    {stepInstructions.guidance}

    ## Response Format
    Return JSON: {"success": true|false, "results": "path or inline", "summary": "brief description"}
  """
)
```

**If subagent is null:**

- Handle the step directly

### 4. Processing Results

Parse subagent response:

- `success: true` -> result = "passed"
- `success: false` -> result = "failed"

**Call Navigator.Navigate directly** with minimal inputs:

```json
{
  "workflowType": "{from metadata.navigator.workflowType}",
  "currentStep": "{from metadata.navigator.currentStep}",
  "result": "passed|failed",
  "retryCount": "{from metadata.navigator.retryCount}"
}
```

Navigate returns:

| Field | Purpose |
|-------|---------|
| `currentStep` | The new step |
| `stage` | Workflow stage (e.g., `"planning"`) |
| `subagent` | Who executes next step |
| `stepInstructions` | `{name, description, guidance}` |
| `terminal` | `"success"` or `"hitl"` if done |
| `subjectSuffix` | `[workflow.stage.step]` |
| `action` | `"advance"`, `"retry"`, or `"escalate"` |
| `retriesIncremented` | `true` if retry count increased |

Then call TaskUpdate:

```json
{
  "taskId": "...",
  "subject": "{title} {subjectSuffix}",
  "metadata": {
    "navigator": {
      "workflowType": "{unchanged}",
      "currentStep": "{response.currentStep}",
      "retryCount": "{increment if retriesIncremented, else 0}"
    }
  }
}
```

### 5. Progress Reporting

After each step:

```markdown
## Step: {stepName}

**Subagent:** {subagent or "(none)"}
**Result:** {passed|failed}
**Summary:** {brief summary}

---
```

### 6. Loop Termination

Exit when:

- Task reaches terminal step (success or hitl)
- User interrupts

### 7. Final Report

```markdown
## Execution Complete

**Task:** {taskId}
**Final Status:** {completed|hitl}
**Steps Executed:** {count}

### Execution Trace

1. analyze - passed (Planner)
2. implement - passed (Developer)
3. test - passed (Tester)
...

### Result

{If success: "Task completed successfully!"}
{If HITL: "Task needs human intervention at {step}"}
```

## Handling HITL

When task reaches HITL terminal:

```markdown
## Task Needs Human Intervention

**Task:** task-123
**Reason:** Max retries exceeded

### What Happened

{Brief explanation}

### Next Steps

1. Review the issues manually
2. Make necessary fixes
3. Run `/flow:task-advance task-123 passed` to continue
```
