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

Check the response `action`:

- If `action === "fork"` → go to **Section 5g (Fork/Join Handling)**
- If `action === "join"` → this branch is done; exit the walk loop (only happens inside child task walks)
- Otherwise → continue to 5e

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
  "writeThrough": "pass",
  "branch": null
}
```

When walking inside a branch, include `"branch": "<branchName>"`. Non-branch entries use `null`.

#### 5f. Check Termination

If the response has `terminal` set (`"success"`, `"hitl"`, or `"start"`), exit the loop.

If the loop guard (50 iterations) is hit, exit and warn:

```
WARNING: Loop guard hit at 50 iterations. Workflow may have infinite cycles.
```

#### 5g. Fork/Join Handling

When Navigate returns `action: "fork"`, handle parallel branches with simulated results. The fork response includes **enriched per-branch data** — subagent, stepInstructions, orchestratorInstructions, metadata, and multiStep flag — so child tasks can be created without additional Navigate calls.

##### 5g-i. Record Fork

Add a trace entry with `action: "fork → advance"`. Generate a diagram for the fork step:

```json
{
  "workflowType": "<workflowId>",
  "currentStep": "<forkStepId>",
  "filePath": "<absolute path to .cruft/dry-run/<workflowId>/diagrams/<NN>-<forkStepId>.md>"
}
```

##### 5g-ii. Extract Enriched Fork Data

Read from the Navigate response:

- `fork.branches` — map of branch name → enriched branch info (each has `entryStep`, `subagent`, `stepInstructions`, `orchestratorInstructions`, `multiStep`, `metadata`)
- `fork.joinStep` — the join node ID
- `fork.joinStrategy` — `"all-pass"` or `"any-pass"`

##### 5g-iii. Create Child Tasks

For each branch, create a child task using `TaskCreate` directly with the enriched branch data (no `/flow:task-create` needed):

```
TaskCreate(
  subject: "#{parentId}/{branchName} Dry-run: <workflowId>
→ <workflowType> · <entryStep> (<subagent>)",
  activeForm: "<stepInstructions.name> (<subagent>)",
  description: "<orchestratorInstructions>",
  metadata: {
    ...branchInfo.metadata,
    userDescription: "Dry-run: <workflowId>",
    parentTaskId: "<parentTaskId>",
    forkStep: "<forkStepId>",
    branchName: "<branchName>",
    dryRun: true
  }
)
```

Create all child tasks in a **single message** (parallel `TaskCreate` calls).

Record child IDs in parent metadata as `forkState` via `TaskUpdate`:

```json
{
  "forkStep": "fork_investigate",
  "joinStep": "join_investigate",
  "joinStrategy": "all-pass",
  "branches": {
    "reproduce": { "status": "running", "childTaskId": "42" },
    "code_archaeology": { "status": "running", "childTaskId": "43" },
    "git_forensics": { "status": "running", "childTaskId": "44" }
  }
}
```

##### 5g-iv. Start Child Tasks

Mark all child tasks as `in_progress` in a **single message** (parallel `TaskUpdate` calls):

```
TaskUpdate(taskId: "{childTaskId}", status: "in_progress")
```

##### 5g-v. Walk All Branches in Parallel

Launch one `Task` agent per branch in a **single message** (parallel Task tool calls). The prompt varies by `multiStep`:

- **Single-step** (`multiStep: false`): The agent simulates a single pass/fail result. No Navigate calls needed within the branch.

  ```
  Task(
    subagent_type: "<branch.subagent>",
    prompt: """
      Dry-run: simulate the '<stepInstructions.name>' step for branch '<branchName>'.

      Result: <"passed" or "failed" based on --fail-at>

      Generate diagram: <NN>-<branchName>-<stepId>.md
      Verify write-through on child task file.
      Return JSON: {"success": <true|false>, "trace": [...], "summary": "..."}
    """
  )
  ```

- **Multi-step** (`multiStep: true`): The agent runs a Navigate-advance loop within the branch, simulating pass/fail at each step. Generates per-step diagrams with `<NN>-<branchName>-<stepId>.md` filenames. Exits when Navigate returns `action === "join"`.

  ```
  Task(
    subagent_type: "<branch.subagent>",
    prompt: """
      Dry-run: walk multi-step branch '<branchName>' starting at '<entryStep>'.

      Task file: <childTaskFilePath>
      Fail-at: <stepId or "none">

      For each step:
      1. Generate diagram
      2. Verify write-through
      3. Determine result (passed or failed based on --fail-at)
      4. Call Navigate with taskFilePath and result
      5. If action === "join", exit — branch is done
      6. Otherwise continue to next step

      Return JSON: {"success": <true|false>, "trace": [...], "summary": "..."}
    """
  )
  ```

All branch iterations count against the 50-iteration global guard (sum across all branches).

##### 5g-vi. Evaluate Join

Apply the join strategy from `fork.joinStrategy`:

- `all-pass`: all branches must have `"passed"` → result is `"passed"`, else `"failed"`
- `any-pass`: at least one branch `"passed"` → result is `"passed"`, else `"failed"`

Record a join trace entry. Generate a diagram for the join step.

##### 5g-vii. Advance Parent

Call `Navigator.Navigate` on the parent task file with the computed join result:

```json
{
  "taskFilePath": "<parentTaskFilePath>",
  "result": "<passed|failed>"
}
```

This moves the parent past the join node.

##### 5g-viii. Clean Up

Delete child tasks via `TaskUpdate({ status: "deleted" })`. Clear `forkState` from parent metadata via `TaskUpdate`.

##### 5g-ix. Resume

Return to the main loop at **5a** with the parent now at the post-join step.

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

| #   | Branch | Step               | Result | Action  | Next Step        | Retries | Write-Through |
| --- | ------ | ------------------ | ------ | ------- | ---------------- | ------- | ------------- |
| 0   |        | parse_requirements | passed | advance | explore_codebase | 0/0     | pass          |
| 1   |        | explore_codebase   | passed | advance | fork_investigate | 0/0     | pass          |
| 2   |        | fork_investigate   | —      | fork    | (3 branches)     | —       | skip          |
| 3   | reproduce       | reproduce          | passed | advance | join_investigate | 0/0  | pass          |
| 4   | code_archaeology | code_archaeology  | passed | advance | join_investigate | 0/0  | pass          |
| 5   | git_forensics   | git_forensics      | passed | advance | join_investigate | 0/0  | pass          |
| 6   |        | join_investigate   | passed | join    | synthesize       | —       | skip          |
| 7   |        | synthesize         | passed | advance | write_fix        | 0/0     | pass          |
| ... |        |                    |        |         |                  |         |               |

## Path Taken
```

start → triage → fork_investigate{ reproduce | code_archaeology | git_forensics } → join(all-pass:passed) → synthesize → ... → end_success

```

## Diagrams

| Step | Diagram |
|------|---------|
| parse_requirements | [00-parse_requirements](.cruft/dry-run/<workflowId>/diagrams/00-parse_requirements.md) |
| explore_codebase | [01-explore_codebase](.cruft/dry-run/<workflowId>/diagrams/01-explore_codebase.md) |
| fork_investigate | [02-fork_investigate](.cruft/dry-run/<workflowId>/diagrams/02-fork_investigate.md) |
| reproduce (branch) | [03-reproduce-reproduce](.cruft/dry-run/<workflowId>/diagrams/03-reproduce-reproduce.md) |
| code_archaeology (branch) | [04-code_archaeology-code_archaeology](.cruft/dry-run/<workflowId>/diagrams/04-code_archaeology-code_archaeology.md) |
| git_forensics (branch) | [05-git_forensics-git_forensics](.cruft/dry-run/<workflowId>/diagrams/05-git_forensics-git_forensics.md) |
| join_investigate | [06-join_investigate](.cruft/dry-run/<workflowId>/diagrams/06-join_investigate.md) |
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

Path: start → triage → fork_investigate{ reproduce | code_archaeology | git_forensics } → join(all-pass:passed) → synthesize → ... → end_success
Steps: <count> | Iterations: <count> | Terminal: <success|hitl>
Write-through: <pass count>/<total> passed

Report: .cruft/dry-run/<workflowId>/report.md
Diagrams: .cruft/dry-run/<workflowId>/diagrams/
```

For workflows without fork/join, the path remains linear: `start → step1 → step2 → ... → end_success`

## Edge Cases

**`--fail-at` step never reached:**

If the workflow reaches a terminal state without visiting the `--fail-at` step, include a warning in the report:

```
WARNING: --fail-at step '<stepId>' was never reached during the walk.
The workflow terminated at '<terminalStep>' via path: start → ... → <terminalStep>
```

**`--fail-at` targeting a branch step:**

If `--fail-at` targets a step inside a branch (e.g., `--fail-at reproduce`), that branch fails while other branches pass. The join node evaluates according to its strategy:

- `all-pass` + one branch failed → join result is `"failed"` → workflow follows the failed edge (e.g., to `hitl_inconclusive`)
- `any-pass` + one branch failed but others passed → join result is `"passed"` → workflow continues normally

**Fork/join control nodes and write-through:**

Fork and join nodes are control-flow nodes — the engine writes metadata (currentStep, etc.) but does not update subject or activeForm. Record write-through as `"skip"` for these nodes.

**Loop guard hit:**

If 50 iterations are reached, the report should flag this clearly and include the full trace to help diagnose the cycle. Branch iterations count against the global 50-iteration guard.

**Workflow not found:**

Show error immediately and exit (no task creation).
