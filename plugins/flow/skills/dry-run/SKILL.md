---
description: Walk a workflow end-to-end without executing real work. Generates step-by-step diagrams, verifies write-through persistence, and produces a summary report.
---

# /flow:dry-run

Walk a workflow end-to-end, advancing through every step with simulated pass/fail results. Produces per-step diagrams, verifies write-through persistence, and writes a summary report.

## Usage

```
/flow:dry-run <workflowId> [--fail-at <stepId>] [--keep-task]
```

**Arguments:**

- `workflowId` (required): The workflow to walk (e.g., `feature-development`, `bug-fix`)
- `--fail-at <stepId>` (optional): Simulate failure at this step. All other steps pass. Exercises retry/escalation paths.
- `--keep-task` (optional): Keep the task after completion instead of deleting it.

## Task Directory

Use `$CLAUDE_CODE_TASK_LIST_ID` if set, otherwise fall back to session ID:

```
~/.claude/tasks/${CLAUDE_CODE_TASK_LIST_ID:-${CLAUDE_SESSION_ID}}/
```

## What To Do

### 1. Parse Arguments

Extract `workflowId`, optional `--fail-at <stepId>`, and optional `--keep-task` flag.

If no `workflowId` provided, show an error:

```
Usage: /flow:dry-run <workflowId> [--fail-at <stepId>] [--keep-task]

Run /flow:list to see available workflows.
```

### 2. Start Workflow

Call `Navigator.Navigate` to start the workflow:

```json
{
  "workflowType": "<workflowId>",
  "description": "Dry-run: <workflowId>"
}
```

If the workflow is not found, show:

```
Workflow '<workflowId>' not found.

Run /flow:list to see available workflows.
```

### 3. Create Dry-Run Task

Call `TaskCreate` with dry-run metadata:

```json
{
  "subject": "Dry-run: <workflowId>",
  "activeForm": "Dry-running <workflowId>",
  "description": "Automated dry-run walk of <workflowId> workflow",
  "metadata": {
    "userDescription": "Dry-run: <workflowId>",
    "workflowType": "<workflowId>",
    "currentStep": "<response.metadata.currentStep>",
    "retryCount": 0,
    "dryRun": true
  }
}
```

### 4. Resolve Task File Path

Construct the task file path:

```javascript
const taskDir = process.env.CLAUDE_CODE_TASK_LIST_ID || "${CLAUDE_SESSION_ID}";
const taskFilePath = `~/.claude/tasks/${taskDir}/${taskId}.json`;
```

### 5. Walk the Workflow (Loop)

Initialize a step trace array and iteration counter. Loop with a **max 50 iterations** guard:

**For each iteration:**

#### 5a. Generate Per-Step Diagram

Call `Navigator.Diagram` with:

```json
{
  "workflowType": "<workflowId>",
  "currentStep": "<currentStepId>",
  "filePath": "<absolute path to .cruft/dry-run/<workflowId>/diagrams/<NN>-<stepId>.md>"
}
```

Where `NN` is the zero-padded iteration number (e.g., `00`, `01`, `02`).

#### 5b. Verify Write-Through

Read the task file at `taskFilePath` and verify these fields were updated by the engine's write-through:

- `subject` — contains workflow position info
- `activeForm` — contains step name
- `description` — contains orchestrator instructions
- `metadata.currentStep` — matches expected step
- `metadata.workflowType` — matches workflow
- `metadata.retryCount` — matches expected count

Record write-through status as `pass` or `fail` with details of any mismatches.

#### 5c. Determine Result

- If `--fail-at` is set and current step matches: result = `"failed"`
- Otherwise: result = `"passed"`

#### 5d. Advance

Call `Navigator.Navigate` with taskFilePath and result:

```json
{
  "taskFilePath": "<taskFilePath>",
  "result": "<passed|failed>"
}
```

#### 5e. Record Step

Add to the trace array:

```json
{
  "iteration": 0,
  "stepId": "parse_requirements",
  "result": "passed",
  "action": "advance",
  "nextStep": "explore_codebase",
  "terminal": null,
  "retryCount": 0,
  "maxRetries": 0,
  "writeThrough": "pass"
}
```

#### 5f. Check Termination

If the response has `terminal` set (`"success"`, `"hitl"`, or `"start"`), exit the loop.

If the loop guard (50 iterations) is hit, exit and warn:

```
WARNING: Loop guard hit at 50 iterations. Workflow may have infinite cycles.
```

### 6. Generate Final Diagram

After the loop exits, generate one last diagram for the terminal step:

```json
{
  "workflowType": "<workflowId>",
  "currentStep": "<finalStepId>",
  "filePath": "<absolute path to .cruft/dry-run/<workflowId>/diagrams/<NN>-<finalStepId>.md>"
}
```

### 7. Write Summary Report

Write a markdown report to `.cruft/dry-run/<workflowId>/report.md`:

```markdown
# Dry-Run Report: <workflowId>

**Date:** <timestamp>
**Fail-at:** <stepId or "none">
**Terminal:** <success|hitl|loop-guard>
**Steps walked:** <count>
**Iterations:** <count> (includes retries)

## Step Trace

| # | Step | Result | Action | Next Step | Retries | Write-Through |
|---|------|--------|--------|-----------|---------|---------------|
| 0 | parse_requirements | passed | advance | explore_codebase | 0/0 | pass |
| 1 | explore_codebase | passed | advance | create_plan | 0/0 | pass |
| ... | | | | | | |

## Path Taken

```
start → parse_requirements → explore_codebase → create_plan → ... → end_success
```

## Diagrams

| Step | Diagram |
|------|---------|
| parse_requirements | [00-parse_requirements](.cruft/dry-run/<workflowId>/diagrams/00-parse_requirements.md) |
| explore_codebase | [01-explore_codebase](.cruft/dry-run/<workflowId>/diagrams/01-explore_codebase.md) |
| ... | |

## Write-Through Verification

All steps: <pass count>/<total count> passed

<If any failures, list details>
```

### 8. Clean Up Task

Unless `--keep-task` is set, delete the task:

```json
{
  "taskId": "<taskId>",
  "status": "deleted"
}
```

### 9. Display Results

Show a brief summary in the terminal:

```
Dry-run complete: <workflowId>

Path: start → step1 → step2 → ... → end_success
Steps: <count> | Iterations: <count> | Terminal: <success|hitl>
Write-through: <pass count>/<total> passed

Report: .cruft/dry-run/<workflowId>/report.md
Diagrams: .cruft/dry-run/<workflowId>/diagrams/
```

## Edge Cases

**`--fail-at` step never reached:**

If the workflow reaches a terminal state without visiting the `--fail-at` step, include a warning in the report:

```
WARNING: --fail-at step '<stepId>' was never reached during the walk.
The workflow terminated at '<terminalStep>' via path: start → ... → <terminalStep>
```

**Loop guard hit:**

If 50 iterations are reached, the report should flag this clearly and include the full trace to help diagnose the cycle.

**Workflow not found:**

Show error immediately and exit (no task creation).
