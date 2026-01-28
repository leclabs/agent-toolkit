---
description: Execute flow tasks autonomously with subagent delegation. Primary command after task creation. Handles planning, implementation, testing, and review stages.
---

# /flow:run

Execute flow tasks autonomously, delegating to subagents based on Navigate response.

## Usage

```
/flow:run              # Execute highest priority pending task
/flow:run [taskId]     # Execute specific task
```

## What To Do

### 1. Get Task to Execute

**If taskId provided:**

- Construct task file path: `.claude/todos/{taskId}.json`
- Read task file to get metadata

**If no taskId:**

- List all task files in `.claude/todos/`
- Filter for flow tasks (those with `metadata.workflowType`)
- Get highest priority pending task

### 2. The Execution Loop

WHILE task not at terminal, HITL, blocked, or interrupted step:

1. **NAVIGATE**: Call Navigate with taskFilePath to get current step state
2. **DELEGATE**: If subagent set, use Task tool
3. **EXECUTE**: If no subagent, handle directly
4. **ADVANCE**: Call Navigate with taskFilePath and result
5. **UPDATE**: TaskUpdate with new metadata from Navigate response
6. **REPEAT**: Continue until terminal or HITL

### 3. Getting Current Step

Call `Navigator.Navigate` with taskFilePath:

```json
{
  "taskFilePath": ".claude/todos/1.json"
}
```

Response includes `subagent`, `stepInstructions`, `terminal`, `metadata`, etc.

### 4. Delegation Protocol

**If subagent is set (e.g., `@flow:Developer`):**

Use the Task tool to delegate the step to the subagent.

Example:

```
Task(
  subagent_type: "flow:Developer",
  prompt: """
    Execute the '{stepName}' step for task {taskId}.

    ## Task
    {task subject and description}

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

### 5. Processing Results

Parse subagent response:

- `success: true` -> result = "passed"
- `success: false` -> result = "failed"

**Call Navigator.Navigate** with taskFilePath and result:

```json
{
  "taskFilePath": ".claude/todos/1.json",
  "result": "passed"
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
| `orchestratorInstructions` | Updated task description |
| `metadata` | `{ workflowType, currentStep, retryCount }` |
| `action` | `"advance"`, `"retry"`, or `"escalate"` |
| `retriesIncremented` | `true` if retry count increased |

Then call TaskUpdate with new metadata:

```json
{
  "taskId": "1",
  "description": "{response.orchestratorInstructions}",
  "metadata": {
    "currentStep": "{response.metadata.currentStep}",
    "retryCount": "{response.metadata.retryCount}"
  }
}
```

### 6. Progress Reporting

After each step, show brief progress:

```
✓ parse_requirements (@flow:Planner) → passed
✓ implement (@flow:Developer) → passed
⟳ test (@flow:Tester) → in progress...
```

### 7. Loop Termination

Exit when:

- Task reaches terminal step (success or hitl)
- User interrupts

### 8. Final Report

**Success:**

```
Completed: #1 Add user auth (@flow:Developer)
 → feature-development · end
 → end_success · completed ✓

Steps: parse_requirements → implement → test → commit → end_success
```

**HITL:**

```
⚠ HITL: #1 Add user auth (direct)
 → feature-development · verification
 → hitl_test · pending

Reason: Max retries exceeded at test step
Action: Fix manually, then `/flow:task-advance 1 passed`
```
